"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuards } from "@/hooks/useGuards";
import type { GuardCollectionSnapshot, GuardSettings, GuardSnapshot, ManagedGuardSnapshot } from "@/types/guard";

const emptySnapshot: GuardSnapshot = {
  instanceId: "", revision: -1, runId: 0, phase: "paused", settings: null,
  sessionTitle: "", projectPath: "", turnId: null,
  nextMessage: null, requests: [], logs: [],
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "无法连接本地守护服务。";
}

export function useGuard(guardId: string | null, onRestoreSettings: (settings: GuardSettings) => void) {
  const router = useRouter();
  const [guard, setGuard] = useState<GuardSnapshot>(emptySnapshot);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(emptySnapshot);
  const startingRef = useRef(false);

  const acceptSnapshot = useCallback(function acceptSnapshot(snapshot: ManagedGuardSnapshot) {
    const previous = latest.current;
    if (snapshot.instanceId === previous.instanceId && snapshot.revision < previous.revision) return;
    if (snapshot.settings !== null && (previous.instanceId !== snapshot.instanceId || previous.runId !== snapshot.runId)) {
      onRestoreSettings(snapshot.settings);
    }
    latest.current = snapshot;
    setGuard(snapshot);
    setDeleting(snapshot.deleting);
  }, [onRestoreSettings]);

  const receiveCollection = useCallback(function receiveCollection(snapshot: GuardCollectionSnapshot) {
    const selected = snapshot.guards.find(function match(item) { return item.id === guardId; });
    setMissing(!selected);
    if (selected) acceptSnapshot(selected);
  }, [guardId, acceptSnapshot]);
  const collection = useGuards(guardId !== null, receiveCollection);
  const loaded = guardId === null || (collection.loaded && !missing && guard.instanceId !== "");

  async function sendAction(body: object): Promise<ManagedGuardSnapshot> {
    setError("");
    const path = guardId === null ? "/api/guards" : "/api/guards/" + encodeURIComponent(guardId);
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "守护操作失败。" );
    acceptSnapshot(data);
    return data;
  }

  async function start(settings: GuardSettings) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const created = await sendAction({ action: "start", settings: settings });
      if (guardId === null) router.replace("/guards/" + encodeURIComponent(created.id));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      startingRef.current = false;
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

  let visibleError = error || collection.error;
  if (missing) visibleError = "守护不存在或已被删除。";
  return { guard: guard, loaded: loaded, missing: missing, deleting: deleting, starting: starting, pausing: pausing, error: visibleError, start: start, pause: pause, respond: respond };
}
