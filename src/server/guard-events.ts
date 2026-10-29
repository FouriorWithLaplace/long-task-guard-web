import type { GuardRunner } from "./guard-runner";
import type { GuardSnapshot } from "@/types/guard";

export function createGuardEventStream(runner: GuardRunner, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let heartbeat: ReturnType<typeof setInterval>;
  let unsubscribe = function noSubscription() {};
  let stopped = false;
  let lastRevision = -1;
  let pending: GuardSnapshot | null = null;

  function cleanup() {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    clearInterval(heartbeat);
    signal.removeEventListener("abort", disconnect);
    pending = null;
  }

  function disconnect() {
    if (stopped) return;
    cleanup();
    controller.close();
  }

  function sendSnapshot(snapshot: GuardSnapshot) {
    if (stopped || snapshot.revision === lastRevision) return;

    // 页面读取较慢时只保留最新状态，避免积压大量完整日志。
    if (controller.desiredSize !== null && controller.desiredSize <= 0) {
      pending = snapshot;
      return;
    }

    let frame = "event: snapshot\ndata: " + JSON.stringify(snapshot) + "\n\n";
    if (lastRevision === -1) frame = "retry: 2000\n" + frame;
    controller.enqueue(encoder.encode(frame));
    lastRevision = snapshot.revision;
  }

  function keepAlive() {
    if (!stopped && controller.desiredSize !== null && controller.desiredSize > 0) {
      // SSE 注释维持现有连接，不会产生新的 HTTP 请求或模型调用。
      controller.enqueue(encoder.encode(": keep-alive\n\n"));
    }
  }

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (signal.aborted) {
        disconnect();
        return;
      }

      unsubscribe = runner.subscribe(sendSnapshot);
      signal.addEventListener("abort", disconnect, { once: true });
      heartbeat = setInterval(keepAlive, 25000);
      sendSnapshot(runner.snapshot());
    },
    pull() {
      if (pending !== null) {
        const snapshot = pending;
        pending = null;
        sendSnapshot(snapshot);
      }
    },
    cancel() {
      cleanup();
    },
  });
}
