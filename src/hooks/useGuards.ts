"use client";

import { useEffect, useRef, useState } from "react";
import type { GuardCollectionSnapshot } from "@/types/guard";

const emptyCollection: GuardCollectionSnapshot = { instanceId: "", revision: -1, guards: [] };

export function useGuards(enabled = true, onSnapshot?: (snapshot: GuardCollectionSnapshot) => void) {
  const [collection, setCollection] = useState(emptyCollection);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(emptyCollection);

  useEffect(function watchGuards() {
    if (!enabled) return;
    const stream = new EventSource("/api/guards/events");

    function receiveSnapshot(event: MessageEvent<string>) {
      try {
        const snapshot = JSON.parse(event.data) as GuardCollectionSnapshot;
        if (!Array.isArray(snapshot.guards)) throw new Error("守护列表格式不正确。");
        const previous = latest.current;
        if (snapshot.instanceId === previous.instanceId && snapshot.revision < previous.revision) return;
        latest.current = snapshot;
        setCollection(snapshot);
        onSnapshot?.(snapshot);
        setLoaded(true);
        setError("");
      } catch {
        setError("无法读取实时守护状态。");
      }
    }

    function reconnecting() {
      setLoaded(false);
      setError("实时连接已断开，正在重新连接…");
    }

    stream.addEventListener("snapshot", receiveSnapshot);
    stream.addEventListener("error", reconnecting);
    return function stopWatching() {
      stream.removeEventListener("snapshot", receiveSnapshot);
      stream.removeEventListener("error", reconnecting);
      stream.close();
    };
  }, [enabled, onSnapshot]);

  return { guards: collection.guards, loaded: loaded, error: error };
}
