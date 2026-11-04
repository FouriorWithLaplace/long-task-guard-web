"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { GuardSnapshot } from "@/types/guard";
import { followTerminalOutput } from "./terminal-follow";
import "@xterm/xterm/css/xterm.css";

export default function GuardTerminal({ guardId, guard }: { guardId: string; guard: GuardSnapshot }) {
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const resizeRemote = useRef<(() => void) | null>(null);
  const followOutput = useRef<ReturnType<typeof followTerminalOutput> | null>(null);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("正在准备终端…");
  const sessionId = guard.settings?.sessionId ?? "";
  const active = guard.phase !== "paused" && guard.phase !== "stopping";

  useEffect(function prepareTerminal() {
    let disposed = false;
    let instance: Terminal | null = null;
    let observer: ResizeObserver | null = null;
    let timer: ReturnType<typeof setTimeout>;

    async function prepare() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !container.current) return;
      instance = new Terminal({
        disableStdin: true, cursorBlink: false, scrollback: 2000,
        fontFamily: 'Consolas, "Cascadia Mono", monospace', fontSize: 13,
        theme: { background: "#0f172a", foreground: "#e2e8f0" },
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      instance.loadAddon(fit);
      instance.open(container.current);
      terminal.current = instance;
      followOutput.current = followTerminalOutput(instance, container.current);
      function resize() {
        if (disposed || !instance) return;
        fit.fit();
        // 与服务端的资源边界一致，窄窗口保留横向滚动。
        const cols = Math.max(40, Math.min(240, instance.cols));
        const rows = Math.max(10, Math.min(80, instance.rows));
        instance.resize(cols, rows);
        resizeRemote.current?.();
      }
      resize();
      observer = new ResizeObserver(function resized() {
        clearTimeout(timer);
        timer = setTimeout(resize, 150);
      });
      observer.observe(container.current);
      setReady(true);
    }
    void prepare().catch(function failed(error) {
      if (!disposed) setStatus(error instanceof Error ? error.message : "无法加载终端。");
    });
    return function cleanup() {
      disposed = true;
      clearTimeout(timer);
      observer?.disconnect();
      followOutput.current?.dispose();
      followOutput.current = null;
      instance?.dispose();
      terminal.current = null;
    };
  }, []);

  useEffect(function connectTerminal() {
    if (!ready || !terminal.current || !active || !sessionId) return;
    const instance = terminal.current;
    const endpoint = "/api/guards/" + encodeURIComponent(guardId) + "/terminal";
    let disposed = false;
    let viewerId = "";
    let stream: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let stableTimer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let pendingCharacters = 0;
    let frameGeneration = 0;
    let resizing = false;
    let resizeAgain = false;

    function release() {
      frameGeneration++;
      clearTimeout(stableTimer);
      stream?.close();
      stream = null;
      if (viewerId) {
        const releasedId = viewerId;
        viewerId = "";
        void fetch(endpoint, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewerId: releasedId }), keepalive: true,
        }).catch(function ignoreDisconnectedPage() {});
      }
    }
    function reconnect(message: string) {
      release();
      if (disposed) return;
      clearTimeout(reconnectTimer);
      setStatus(message);
      if (attempts >= 5) { setStatus(message + " 请点击重新连接。"); return; }
      reconnectTimer = setTimeout(open, Math.min(1000 * 2 ** attempts, 10000));
    }
    function write(data: string, screen?: { cols: number; rows: number }) {
      if (disposed) return;
      pendingCharacters += data.length;
      if (pendingCharacters > 2 * 1024 * 1024) {
        reconnect("显示暂时跟不上输出，正在重建画面…");
        return;
      }
      const following = followOutput.current;
      following?.beforeWrite();
      if (screen) {
        instance.resize(screen.cols, screen.rows);
        instance.reset();
      }
      instance.write(data, function rendered() {
        pendingCharacters -= data.length;
        following?.afterWrite();
      });
    }
    async function resize() {
      if (disposed || !viewerId) return;
      if (resizing) { resizeAgain = true; return; }
      resizing = true;
      const currentViewer = viewerId;
      try {
        await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resize", viewerId: currentViewer, cols: instance.cols, rows: instance.rows }),
        });
      } catch { /* 流断开时由重连流程恢复。 */ }
      finally {
        resizing = false;
        if (resizeAgain) { resizeAgain = false; void resize(); }
      }
    }
    async function open() {
      if (disposed) return;
      attempts++;
      setStatus("正在连接 Codex 原生终端…");
      try {
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open", cols: instance.cols, rows: instance.rows }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "终端连接失败。");
        viewerId = result.viewerId;
        if (disposed) { release(); return; }
        const currentGeneration = ++frameGeneration;
        instance.reset();
        followOutput.current?.resume();
        const source = new EventSource(endpoint + "?viewer=" + encodeURIComponent(viewerId));
        stream = source;
        source.onopen = function connected() {
          stableTimer = setTimeout(function stableConnection() { attempts = 0; }, 10000);
        };
        source.addEventListener("screen", function screen(event) {
          if (disposed || currentGeneration !== frameGeneration) return;
          const frame = JSON.parse(event.data);
          // 服务端快照来自相同的 xterm 状态机，恢复时保持其尺寸与 ANSI 顺序。
          write(frame.data, frame);
          setStatus("实时连接 · 只读显示");
        });
        source.addEventListener("data", function data(event) {
          if (disposed || currentGeneration !== frameGeneration) return;
          write(JSON.parse(event.data).data);
        });
        source.addEventListener("end", function ended(event) {
          if (currentGeneration === frameGeneration) reconnect(JSON.parse(event.data).message);
        });
        source.onerror = function disconnected() {
          if (currentGeneration === frameGeneration) reconnect("终端连接中断，正在重新连接…");
        };
      } catch (error) {
        reconnect(error instanceof Error ? error.message : "终端连接失败。");
      }
    }
    resizeRemote.current = function requestResize() { void resize(); };
    void open();
    return function cleanup() {
      disposed = true;
      clearTimeout(reconnectTimer);
      resizeRemote.current = null;
      release();
    };
  }, [ready, guardId, active, sessionId, guard.runId, retry]);

  function reconnect() {
    setRetry(function next(previous) { return previous + 1; });
  }
  function scrollToBottom() { followOutput.current?.resume(); }
  let message = status;
  if (!active) message = "任务已暂停。开始后会自动连接原生终端。";
  else if (!sessionId) message = "正在等待会话创建…";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Codex 原生终端">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-base font-semibold">Codex 原生终端</h2>
          <p role="status" className="mt-1 text-xs text-slate-500">{message}</p>
        </div>
        <div className="flex gap-3 text-sm">
          <button type="button" onClick={scrollToBottom} className="text-slate-600 hover:text-blue-600">回到最新</button>
          <button type="button" onClick={reconnect} disabled={!active || !sessionId} className="text-blue-600 disabled:opacity-40">重新连接</button>
        </div>
      </div>
      <div className="bg-slate-900 p-3">
        <div ref={container} className="h-[32rem] min-h-64 resize-y overflow-auto" />
      </div>
      <p className="px-5 py-3 text-xs text-slate-500">自动跟随最新输出；手动查看历史时暂停跟随，停止操作 5 秒后恢复，也可点击“回到最新”。开始、暂停和回答问题请使用页面按钮；关闭此页面不会停止任务。</p>
    </section>
  );
}
