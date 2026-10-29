import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

export interface CodexEvents {
  onNotification: (method: string, params: Record<string, unknown>) => void;
  onRequest: (id: string | number, method: string, params: Record<string, unknown>) => void;
  onDisconnect: (error: Error) => void;
}

export interface CodexConnection {
  initialize: () => Promise<void>;
  request: (method: string, params: object, timeoutMs?: number) => Promise<unknown>;
  respond: (id: string | number, result: object) => void;
  rejectRequest: (id: string | number, message: string) => void;
  close: () => void;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// 每个守护任务只管理自己创建的 app-server，不连接或关闭其他 Codex 窗口。
export class CodexClient implements CodexConnection {
  private child: ChildProcessWithoutNullStreams;
  private lines: readline.Interface;
  private events: CodexEvents;
  private pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private closed = false;

  constructor(executable: string, cwd: string, events: CodexEvents) {
    this.events = events;
    this.child = spawn(executable, ["--no-daemon", "app-server", "--listen", "stdio://"], {
      cwd: cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.lines = readline.createInterface({ input: this.child.stdout });

    this.lines.on("line", this.handleLine.bind(this));
    this.child.stderr.resume();
    this.child.on("error", this.handleDisconnect.bind(this));
    this.child.stdin.on("error", this.handleDisconnect.bind(this));
    this.child.on("close", this.handleExit.bind(this));
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: { name: "long_task_guard", version: "0.1.0" },
      capabilities: { experimentalApi: false },
    });
    this.send({ method: "initialized" });
  }

  request(method: string, params: object, timeoutMs = 30000): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("Codex 连接已关闭。"));
    }

    const id = "guard-" + ++this.nextId;
    return new Promise((resolve, reject) => {
      const expire = () => {
        this.pending.delete(id);
        reject(new Error("Codex 请求超时：" + method));
      };

      const timeout = setTimeout(expire, timeoutMs);
      this.pending.set(id, { resolve: resolve, reject: reject, timeout: timeout });

      try {
        this.send({ id: id, method: method, params: params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  respond(id: string | number, result: object) {
    this.send({ id: id, result: result });
  }

  rejectRequest(id: string | number, message: string) {
    this.send({ id: id, error: { code: -32601, message: message } });
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.lines.close();

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Codex 连接已关闭。"));
    }

    this.pending.clear();
    this.child.stdin.end();
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;

    if (process.platform === "win32" && this.child.pid) {
      // Windows 的 kill 不会清理子进程；这里只结束自己启动的进程树。
      const cleanup = spawn("taskkill.exe", ["/PID", String(this.child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      const child = this.child;
      cleanup.on("error", function fallbackToKill() { child.kill(); });
      cleanup.on("exit", function checkCleanup(code) {
        if (code !== 0) child.kill();
      });
    } else {
      this.child.kill();
    }
  }

  private send(message: object) {
    if (this.closed) {
      throw new Error("Codex 连接已关闭。" );
    }

    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  private handleLine(line: string) {
    if (this.closed) return;

    try {
      const message = JSON.parse(line);

      if (!message || typeof message !== "object") {
        throw new Error("Codex 返回了无效的协议数据。" );
      }

      if (typeof message.method === "string") {
        const params = message.params || {};

        if (typeof message.id === "string" || typeof message.id === "number") {
          this.events.onRequest(message.id, message.method, params);
        } else {
          this.events.onNotification(message.method, params);
        }

        return;
      }

      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(new Error(message.error.message || "Codex 请求失败。"));
      } else {
        pending.resolve(message.result);
      }
    } catch (error) {
      let failure = new Error("无法读取 Codex 响应。" );
      if (error instanceof Error) failure = error;
      this.handleDisconnect(failure);
    }
  }

  private handleExit() {
    this.handleDisconnect(new Error("本地 Codex 进程已退出。"));
  }

  private handleDisconnect(error: Error) {
    if (this.closed) return;
    this.close();
    this.events.onDisconnect(error);
  }
}
