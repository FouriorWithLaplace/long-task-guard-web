import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { createHash, randomBytes } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import WebSocket from "ws";

export interface CodexTerminalTarget {
  executable: string;
  cwd: string;
  endpoint: string;
  token: string;
}

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
  terminalTarget?: () => CodexTerminalTarget | null;
}

interface PendingRequest {
  method: string;
  threadId: unknown;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
}

// WebSocket app-server 不依赖 stdin 存活；服务退出时清理自己启动的进程。
const ownedGlobal = globalThis as typeof globalThis & { longTaskGuardOwnedProcesses?: Set<number> };

export function trackOwnedProcess(pid: number | undefined): () => void {
  if (!pid) return function nothingToTrack() {};
  if (!ownedGlobal.longTaskGuardOwnedProcesses) {
    ownedGlobal.longTaskGuardOwnedProcesses = new Set();
    process.once("exit", cleanupOwnedProcesses);
  }
  const processes = ownedGlobal.longTaskGuardOwnedProcesses;
  processes.add(pid);
  return function untrack() { processes.delete(pid); };
}

function cleanupOwnedProcesses() {
  for (const pid of ownedGlobal.longTaskGuardOwnedProcesses ?? []) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch { /* 已退出的进程不需要再次清理。 */ }
  }
}

// 每个守护任务只管理自己创建的 app-server，不连接或关闭其他 Codex 窗口。
export class CodexClient implements CodexConnection {
  private child: ChildProcessWithoutNullStreams;
  private lines: readline.Interface;
  private events: CodexEvents;
  private pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private closed = false;
  private socket: WebSocket | null = null;
  private target: CodexTerminalTarget | null = null;
  private ready: Promise<void> = Promise.resolve();
  private rejectReady: ((error: Error) => void) | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private untrackProcess: () => void;

  constructor(executable: string, cwd: string, events: CodexEvents, transport: "stdio" | "websocket" = "stdio") {
    this.events = events;
    const args = ["--no-daemon", "app-server", "--listen", "stdio://"];
    const token = randomBytes(32).toString("hex");
    if (transport === "websocket") {
      args[3] = "ws://127.0.0.1:0";
      args.push("--ws-auth", "capability-token", "--ws-token-sha256", createHash("sha256").update(token).digest("hex"));
    }
    // Codex 是用户安装的本机程序，不应让打包器追踪整个工程来寻找可执行文件。
    this.child = spawn(/* turbopackIgnore: true */ executable, args, {
      cwd: cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.untrackProcess = trackOwnedProcess(this.child.pid);
    this.lines = readline.createInterface({ input: this.child.stdout });

    if (transport === "stdio") {
      this.lines.on("line", this.handleLine.bind(this));
      this.child.stderr.resume();
    } else {
      this.ready = this.connectWebSocket(executable, cwd, token);
      // 启动失败可能先于调用 initialize；仍由 initialize 和 onDisconnect 报告。
      void this.ready.catch(function ignoreEarlyRejection() {});
    }
    this.child.on("error", this.handleDisconnect.bind(this));
    this.child.stdin.on("error", this.handleDisconnect.bind(this));
    this.child.on("close", this.handleExit.bind(this));
  }

  async initialize() {
    await this.ready;
    await this.request("initialize", {
      clientInfo: { name: "long_task_guard", version: "0.1.0" },
      capabilities: { experimentalApi: false },
    });
    this.send({ method: "initialized" });
  }

  terminalTarget(): CodexTerminalTarget | null {
    if (this.closed || !this.target) return null;
    return { ...this.target };
  }

  private connectWebSocket(executable: string, cwd: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.rejectReady = reject;
      let startupOutput = "";
      this.startupTimer = setTimeout(() => {
        this.handleDisconnect(new Error("Codex WebSocket 启动超时，请确认本机 Codex 支持 --remote 和 WebSocket app-server。"));
      }, 15000);
      this.child.stderr.on("data", (chunk: Buffer) => {
        if (this.socket || this.closed) return;
        startupOutput = (startupOutput + chunk.toString()).slice(-8192);
        // next dev 会传递 FORCE_COLOR；启动横幅可能带颜色，不能把它当协议字符。
        const match = stripVTControlCharacters(startupOutput).match(/listening on:\s*(ws:\/\/127\.0\.0\.1:\d+)\s/);
        if (!match) return;
        const endpoint = match[1];
        const socket = new WebSocket(endpoint, { headers: { Authorization: "Bearer " + token } });
        this.socket = socket;
        socket.on("message", (data) => { this.handleLine(data.toString()); });
        socket.on("error", this.handleDisconnect.bind(this));
        socket.on("close", () => {
          this.handleDisconnect(new Error("Codex WebSocket 连接已关闭。"));
        });
        socket.on("open", () => {
          if (this.closed) return;
          if (this.startupTimer) clearTimeout(this.startupTimer);
          this.startupTimer = null;
          this.rejectReady = null;
          this.target = { executable, cwd, endpoint, token };
          resolve();
        });
      });
    });
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
      const threadId = (params as Record<string, unknown>).threadId;
      this.pending.set(id, { method, threadId, resolve, reject, timeout });

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
    this.untrackProcess();
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.rejectReady?.(new Error("Codex 连接已关闭。"));
    this.rejectReady = null;
    this.target = null;
    this.socket?.terminate();
    this.lines.close();

    for (const pending of this.pending.values()) {
      if (pending.timeout !== null) clearTimeout(pending.timeout);
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

    if (this.socket) this.socket.send(JSON.stringify(message));
    else this.child.stdin.write(JSON.stringify(message) + "\n");
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

        if (message.method === "error" && params.willRetry === true && typeof params.threadId === "string") {
          // Codex 已接受本轮并正在内部重连，等待响应、最终失败或断开；不要用请求超时打断重连。
          for (const pending of this.pending.values()) {
            if (pending.method === "turn/start" && pending.threadId === params.threadId && pending.timeout !== null) {
              clearTimeout(pending.timeout);
              pending.timeout = null;
            }
          }
        }

        if (message.method === "turn/completed" && typeof params.turn?.id === "string") {
          // 已收到最终轮次结果时，无需再等待可能缺失的开始响应。
          for (const [id, pending] of this.pending) {
            if (pending.method === "turn/start" && pending.threadId === params.threadId && pending.timeout === null) {
              this.pending.delete(id);
              pending.resolve({ turn: params.turn });
            }
          }
        }

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
      if (pending.timeout !== null) clearTimeout(pending.timeout);

      if (message.error) {
        const failure = new Error(message.error.message || "Codex 请求失败。");
        // 保留服务端的结构化错误，守护可据此识别上游 HTTP 状态码。
        Object.assign(failure, { data: message.error.data });
        pending.reject(failure);
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
