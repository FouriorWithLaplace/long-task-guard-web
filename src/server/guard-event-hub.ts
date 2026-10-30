import type { GuardSnapshot } from "@/types/guard";

type SnapshotListener = (snapshot: GuardSnapshot) => void;

export interface GuardEventSource {
  snapshot(): GuardSnapshot;
  subscribe(listener: SnapshotListener): () => void;
}

// 网页订阅这个稳定入口；热更新替换任务实例时，现有连接也能收到新任务的进展。
export class GuardEventHub implements GuardEventSource {
  private source: GuardEventSource;
  private unsubscribe: () => void;
  private listeners = new Set<SnapshotListener>();

  constructor(source: GuardEventSource) {
    this.source = source;
    this.unsubscribe = source.subscribe(this.publish.bind(this));
  }

  follow(source: GuardEventSource) {
    if (source === this.source) return;
    this.unsubscribe();
    this.source = source;
    this.unsubscribe = source.subscribe(this.publish.bind(this));
    this.publish(source.snapshot());
  }

  snapshot(): GuardSnapshot {
    return this.source.snapshot();
  }

  subscribe(listener: SnapshotListener): () => void {
    const listeners = this.listeners;
    listeners.add(listener);
    return function unsubscribe() { listeners.delete(listener); };
  }

  private publish(snapshot: GuardSnapshot) {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}
