"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GuardSettings, GuardSnapshot } from "@/types/guard";

const emptySnapshot: GuardSnapshot = {
  instanceId: "", revision: -1, runId: 0, phase: "paused", settings: null,
  sessionTitle: "", projectPath: "", turnId: null,
  nextMessage: null, requests: [], logs: [],
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "无法连接本地守护服务。";
}

export function useGuard(onRestoreSettings: (settings: GuardSettings) => void) {
  const [guard, setGuard] = useState<GuardSnapshot>(emptySnapshot);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const latest = useRef(emptySnapshot);

  const acceptSnapshot = useCallback(function acceptSnapshot(snapshot: GuardSnapshot) {
    const previous = latest.current;
    if (snapshot.instanceId === previous.instanceId && snapshot.revision < previous.revision) return;
    if (snapshot.settings !== null && (previous.instanceId !== snapshot.instanceId || previous.runId !== snapshot.runId)) {
      onRestoreSettings(snapshot.settings);
    }
    latest.current = snapshot;
    setGuard(snapshot);
  }, [onRestoreSettings]);

  // 建立一次 SSE 连接，由服务器在状态变化时主动推送。
  useEffect(function watchGuard() {
    const stream = new EventSource("/api/guard/events");

    function receiveSnapshot(event: MessageEvent<string>) {
      try {
        const snapshot = JSON.parse(event.data) as GuardSnapshot;
        acceptSnapshot(snapshot);
        setLoaded(true);
        setConnectionError("");
      } catch (failure) {
        setConnectionError(errorMessage(failure));
      }
    }

    function reconnecting() {
      setLoaded(false);
      setConnectionError("实时连接已断开，正在重新连接…");
    }

    stream.addEventListener("snapshot", receiveSnapshot);
    stream.addEventListener("error", reconnecting);

    return function stopWatching() {
      stream.removeEventListener("snapshot", receiveSnapshot);
      stream.removeEventListener("error", reconnecting);
      stream.close();
    };
  }, [acceptSnapshot]);

  async function sendAction(body: object) {
    setError("");
    const response = await fetch("/api/guard", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "守护操作失败。" );
    acceptSnapshot(data);
  }

  async function start(settings: GuardSettings) {
    setStarting(true);
    try {
      await sendAction({ action: "start", settings: settings });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setStarting(false);
    }
  }

  async function pause() {
    setPausing(true);
    try {
      await sendAction({ action: "pause" });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPausing(false);
    }
  }

  async function respond(id: string | number, response: object) {
    try {
      await sendAction({ action: "respond", id: id, response: response });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return { guard: guard, loaded: loaded, starting: starting, pausing: pausing, error: error || connectionError, start: start, pause: pause, respond: respond };
}
