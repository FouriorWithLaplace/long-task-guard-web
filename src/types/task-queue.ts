import type { EntryTask } from "./encyclopedia.ts";

export type QueueTask = Pick<EntryTask, "entityId" | "queuedAt" | "queueOrder" | "phase" | "desired" | "slotHeld" | "nextRetryAt">;
export type QueueState = "active" | "waiting" | "delayed" | "stopping" | "inactive";
export interface QueueDisplay {
  state: QueueState;
  position: number | null;
}
export interface TaskQueueIndex {
  id: number;
  active: boolean;
  queue?: QueueTask;
}

// 调度器和页面共用同一套入队次序与就绪条件。
export function compareQueueOrder(a: QueueTask, b: QueueTask): number {
  return a.queuedAt.localeCompare(b.queuedAt) || (a.queueOrder || 0) - (b.queueOrder || 0) || a.entityId - b.entityId;
}

export function readyToStart(task: QueueTask, now = Date.now()): boolean {
  return task.desired === "running" && ["queued", "retrying"].includes(task.phase) &&
    !(task.nextRetryAt && Date.parse(task.nextRetryAt) > now);
}

export function queueState(task: QueueTask, now = Date.now()): QueueState {
  if (task.slotHeld) return "active";
  if (task.phase === "stopping") return "stopping";
  if (task.desired !== "running") return "inactive";
  return readyToStart(task, now) ? "waiting" : "delayed";
}

export function compareExecutionOrder(a: QueueTask, b: QueueTask, now = Date.now()): number {
  const rank = { active: 0, waiting: 1, delayed: 2, stopping: 3, inactive: 4 };
  const left = queueState(a, now);
  const right = queueState(b, now);
  return rank[left] - rank[right] || (left === "inactive" ? a.entityId - b.entityId : compareQueueOrder(a, b));
}
