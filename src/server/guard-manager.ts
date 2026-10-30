import { randomUUID } from "node:crypto";
import type { GuardRunner } from "./guard-runner";
import type { GuardEventSource } from "./guard-event-hub";
import type { GuardCollectionSnapshot, GuardSettings, ManagedGuardSnapshot, SessionSummary } from "@/types/guard";

interface GuardEntry {
  id: string;
  createdAt: string;
  runner: GuardRunner;
  deleting: boolean;
  deletion: Promise<void> | null;
  unsubscribe: () => void;
}

export class GuardError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// 会话占用检查与启动之间不插入 await，避免并发请求同时占用同一会话。
export class GuardManager implements GuardEventSource<GuardCollectionSnapshot> {
  private createRunner: () => GuardRunner;
  private entries = new Map<string, GuardEntry>();
  private listeners = new Set<(snapshot: GuardCollectionSnapshot) => void>();
  private instanceId = randomUUID();
  private revision = 0;
  private notificationQueued = false;

  constructor(createRunner: () => GuardRunner) {
    this.createRunner = createRunner;
  }

  snapshot(): GuardCollectionSnapshot {
    const guards: ManagedGuardSnapshot[] = [];
    for (const entry of this.entries.values()) guards.push(this.entrySnapshot(entry));
    return { instanceId: this.instanceId, revision: this.revision, guards: guards };
  }

  subscribe(listener: (snapshot: GuardCollectionSnapshot) => void): () => void {
    const listeners = this.listeners;
    listeners.add(listener);
    return function unsubscribe() { listeners.delete(listener); };
  }

  get(id: string): ManagedGuardSnapshot {
    return this.entrySnapshot(this.find(id));
  }

  // 接管开发热更新前的单守护实例，保留它的连接和执行状态。
  adopt(runner: GuardRunner): void {
    this.add(runner);
  }

  async create(settings: GuardSettings, session: SessionSummary): Promise<ManagedGuardSnapshot> {
    this.assertSessionAvailable(settings.sessionId);
    const entry = this.add(this.createRunner());
    await entry.runner.start(settings, session);
    return this.get(entry.id);
  }

  async start(id: string, settings: GuardSettings, session: SessionSummary): Promise<ManagedGuardSnapshot> {
    const entry = this.findAvailable(id);
    if (entry.runner.snapshot().phase !== "paused") throw new GuardError("这个守护正在执行，请先暂停。", 409);
    this.assertSessionAvailable(settings.sessionId, id);
    await entry.runner.start(settings, session);
    return this.get(id);
  }

  async pause(id: string): Promise<ManagedGuardSnapshot> {
    const entry = this.findAvailable(id);
    await entry.runner.pause();
    return this.get(id);
  }

  respond(id: string, requestId: string | number, response: Record<string, unknown>): ManagedGuardSnapshot {
    const entry = this.findAvailable(id);
    entry.runner.respond(requestId, response);
    return this.entrySnapshot(entry);
  }

  async remove(id: string): Promise<void> {
    const entry = this.find(id);
    if (entry.deletion) return entry.deletion;
    entry.deleting = true;
    this.changed();
    const operation = this.pauseAndRemove(entry);
    entry.deletion = operation;
    try {
      await operation;
    } catch (error) {
      entry.deleting = false;
      this.changed();
      throw error;
    } finally {
      entry.deletion = null;
    }
  }

  private async pauseAndRemove(entry: GuardEntry): Promise<void> {
    await entry.runner.pause();
    if (entry.runner.snapshot().phase !== "paused") throw new GuardError("守护尚未暂停，请稍后重试删除。", 409);
    entry.unsubscribe();
    this.entries.delete(entry.id);
    this.changed();
  }

  private add(runner: GuardRunner): GuardEntry {
    const entry: GuardEntry = {
      id: randomUUID(), createdAt: new Date().toISOString(), runner: runner,
      deleting: false, deletion: null, unsubscribe: function noSubscription() {},
    };
    entry.unsubscribe = runner.subscribe(this.changed.bind(this));
    this.entries.set(entry.id, entry);
    this.changed();
    return entry;
  }

  private find(id: string): GuardEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new GuardError("守护不存在或已被删除。", 404);
    return entry;
  }

  private findAvailable(id: string): GuardEntry {
    const entry = this.find(id);
    if (entry.deleting) throw new GuardError("这个守护正在删除。", 409);
    return entry;
  }

  private assertSessionAvailable(sessionId: string, exceptId?: string): void {
    for (const entry of this.entries.values()) {
      if (entry.id === exceptId) continue;
      const snapshot = entry.runner.snapshot();
      if (snapshot.settings?.sessionId === sessionId && snapshot.phase !== "paused") {
        throw new GuardError("这个会话已被另一个正在执行的守护占用，请先暂停那个守护。", 409);
      }
    }
  }

  private entrySnapshot(entry: GuardEntry): ManagedGuardSnapshot {
    return { ...entry.runner.snapshot(), id: entry.id, createdAt: entry.createdAt, deleting: entry.deleting };
  }

  private changed(): void {
    this.revision++;
    if (this.notificationQueued || this.listeners.size === 0) return;
    this.notificationQueued = true;
    queueMicrotask(this.publish.bind(this));
  }

  private publish(): void {
    this.notificationQueued = false;
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
}
