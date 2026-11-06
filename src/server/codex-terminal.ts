import { randomUUID } from "node:crypto";
import pty from "node-pty";
import headless from "@xterm/headless";
import serialization from "@xterm/addon-serialize";
import type { CodexTerminalTarget } from "./codex-client";
import { trackOwnedProcess } from "./codex-client.ts";

export type TerminalTarget = CodexTerminalTarget & { sessionId: string };
type TerminalEvent = { type: "data" | "end"; data: string };
type Listener = (event: TerminalEvent) => void;
type SpawnTerminal = typeof pty.spawn;

export function terminalSize(cols: unknown, rows: unknown) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) throw new Error("终端尺寸必须是整数。");
  return { cols: Math.max(40, Math.min(240, Number(cols))), rows: Math.max(10, Math.min(80, Number(rows))) };
}

// 一个网页连接对应一个原生 CLI 显示进程；执行任务的 app-server 由守护单独拥有。
export class CodexTerminal {
  readonly id = randomUUID();
  readonly target: TerminalTarget;
  private process: pty.IPty;
  private screen: headless.Terminal;
  private serializer = new serialization.SerializeAddon();
  private listeners = new Set<Listener>();
  private ended = false;
  private exited = false;
  private pendingBytes = 0;
  private outputBuffer = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private claimed = false;
  private claimTimer: ReturnType<typeof setTimeout>;
  private untrackProcess: () => void;

  constructor(target: TerminalTarget, cols: number, rows: number, spawn: SpawnTerminal = pty.spawn) {
    this.target = target;
    this.screen = new headless.Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true });
    this.screen.loadAddon(this.serializer);
    const args = [
      "--remote", target.endpoint,
      "--remote-auth-token-env", "LONG_TASK_GUARD_TERMINAL_TOKEN",
      "--no-alt-screen", "resume", target.sessionId,
    ];
    try {
      this.process = spawn(target.executable, args, {
        name: "xterm-256color", cwd: target.cwd, cols, rows,
        // 使用随 node-pty 分发的 ConPTY，避免系统 ConPTY 关闭时的控制台探测竞态。
        useConptyDll: true,
        env: { ...process.env, TERM: "xterm-256color", LONG_TASK_GUARD_TERMINAL_TOKEN: target.token },
      });
    } catch (error) {
      this.screen.dispose();
      throw error;
    }
    this.untrackProcess = trackOwnedProcess(this.process.pid);
    this.process.onData(this.receive.bind(this));
    this.process.onExit(this.handleExit.bind(this));
    // 原生 CLI 会查询光标位置等终端能力；由终端模拟器回答，浏览器无需发送按键。
    this.screen.onData(this.answerTerminalQuery.bind(this));
    this.claimTimer = setTimeout(this.close.bind(this, "网页没有连接终端。"), 15000);
    this.claimTimer.unref();
  }

  isClosed(): boolean { return this.ended; }

  snapshot() {
    return { cols: this.screen.cols, rows: this.screen.rows, data: this.serializer.serialize() };
  }

  resize(cols: number, rows: number): void {
    if (this.ended) return;
    this.screen.resize(cols, rows);
    this.process.resize(cols, rows);
  }

  close(message = "终端显示已关闭。", kill = true): void {
    if (this.ended) return;
    this.ended = true;
    this.untrackProcess();
    clearTimeout(this.claimTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.outputBuffer = "";
    this.publish({ type: "end", data: message });
    this.listeners.clear();
    // 只杀显示进程。关闭页面不 interrupt、unsubscribe 或关闭 app-server。
    if (kill && !this.exited) {
      try { this.process.kill(); } catch { /* 进程可能已自行退出。 */ }
    }
    this.screen.dispose();
  }

  private receive(data: string): void {
    if (this.ended) return;
    this.pendingBytes += data.length;
    if (this.pendingBytes > 2 * 1024 * 1024) {
      this.close("终端输出过快，正在重新连接显示。任务仍在运行。");
      return;
    }
    this.outputBuffer += data;
    if (!this.flushTimer) this.flushTimer = setTimeout(this.flush.bind(this), 16);
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.ended || !this.outputBuffer) return;
    const data = this.outputBuffer;
    this.outputBuffer = "";
    this.screen.write(data, this.parsed.bind(this, data));
  }

  private parsed(data: string): void {
    this.pendingBytes -= data.length;
    if (!this.ended) this.publish({ type: "data", data });
  }

  private answerTerminalQuery(data: string): void {
    if (!this.ended && !this.exited) this.process.write(data);
  }

  private handleExit(event: { exitCode: number }): void {
    this.exited = true;
    if (this.ended) return;
    this.flush();
    // 等最后一段错误/输出解析完成后再结束流。
    this.screen.write("", this.close.bind(this, "Codex 终端显示已退出（" + event.exitCode + "）。", false));
  }

  private publish(event: TerminalEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    const listeners = this.listeners;
    listeners.add(listener);
    return function unsubscribe() { listeners.delete(listener); };
  }

  stream(signal: AbortSignal, onClose: () => void): ReadableStream<Uint8Array> {
    if (this.claimed || this.ended) throw new Error("终端显示连接已失效，请重新连接。");
    this.claimed = true;
    clearTimeout(this.claimTimer);
    return createTerminalStream(this, signal, onClose);
  }
}

function createTerminalStream(terminal: CodexTerminal, signal: AbortSignal, onClose: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let stopped = false;
  let needsSnapshot = false;
  let heartbeat: ReturnType<typeof setInterval>;
  let unsubscribe = function noSubscription() {};

  function enqueue(type: string, value: unknown) {
    controller.enqueue(encoder.encode("event: " + type + "\ndata: " + JSON.stringify(value) + "\n\n"));
  }
  function cleanup() {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    signal.removeEventListener("abort", abort);
    unsubscribe();
    terminal.close();
    onClose();
  }
  function abort() { cleanup(); controller.close(); }
  function receive(event: TerminalEvent) {
    if (stopped) return;
    if (event.type === "end") {
      enqueue("end", { message: event.data });
      cleanup();
      controller.close();
    } else if (needsSnapshot || (controller.desiredSize ?? 0) <= 0) {
      // ANSI 指令不能随意丢弃。慢客户端恢复读取时，发送完整终端状态重建画面。
      needsSnapshot = true;
    } else {
      enqueue("data", { data: event.data });
    }
  }
  function keepAlive() {
    if (!stopped && (controller.desiredSize ?? 0) > 0) {
      controller.enqueue(encoder.encode(": keep-alive\n\n"));
    }
  }
  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (signal.aborted) { abort(); return; }
      unsubscribe = terminal.subscribe(receive);
      signal.addEventListener("abort", abort, { once: true });
      enqueue("screen", terminal.snapshot());
      heartbeat = setInterval(keepAlive, 10000);
    },
    pull() {
      if (!stopped && needsSnapshot) {
        needsSnapshot = false;
        enqueue("screen", terminal.snapshot());
      }
    },
    cancel() { cleanup(); },
  }, { highWaterMark: 64 * 1024, size(chunk) { return chunk.byteLength; } });
}
