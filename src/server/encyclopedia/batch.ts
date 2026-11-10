import type {
  BatchAction,
  BatchItemResult,
  EntryTask,
} from "../../types/encyclopedia.ts";
import type { EncyclopediaManager } from "./manager.ts";
import { taskProgress } from "../../types/encyclopedia.ts";
import { completionRatio } from "../../types/entry-sort.ts";

export function parseBatchIds(value: unknown, limit = 50000): number[] {
  if (!Array.isArray(value) || !value.length || value.length > limit || value.some(function invalid(id) {
    return !Number.isSafeInteger(id) || id <= 0;
  })) throw new Error("每批需要 1 至 " + limit + " 个有效词条 ID。");
  return [...new Set(value)];
}

export function orderBatchIds(manager: EncyclopediaManager, ids: number[]): number[] {
  const progress = new Map<number, number>();
  for (const id of ids) {
    const task = manager.store?.getSummary(id) ?? manager.get(id);
    progress.set(id, task ? completionRatio(taskProgress(task)) : 0);
  }
  return [...ids].sort(function mostCompleteFirst(a, b) {
    return progress.get(b)! - progress.get(a)! || a - b;
  });
}

export function assertCurrentTaskProtocol(manager: EncyclopediaManager) {
  if (manager.taskProtocol !== 3)
    throw new Error("后台仍在运行旧版任务管理器。请重启 npm run dev 服务，再开始或重新开始；停止仍可使用。");
}

export function parseBatch(body: unknown): {
  action: BatchAction;
  ids: number[];
} {
  if (!body || typeof body !== "object")
    throw new Error("批量请求格式不正确。");
  const { action, ids } = body as { action: BatchAction; ids: number[] };
  if (!["continue", "restart", "stop", "configure"].includes(action))
    throw new Error("不支持的批量操作。");
  return { action, ids: parseBatchIds(ids) };
}

function skipReason(task: EntryTask | null, action: BatchAction) {
  if (action === "configure") {
    if (!task) return "任务尚未开始，请选择模型后开始任务。";
    if (task.phase === "stopping") return "正在停止，请稍后修改设置。";
    return "";
  }
  if (action === "continue" || action === "restart") {
    if (action === "continue" && task?.phase === "completed")
      return "全部字段已处理；需要重查时选择重新开始。";
    if (task?.phase === "stopping")
      return "正在结束执行，请稍后继续。";
    if (task?.desired === "running") return "已在运行或排队。";
    return "";
  }
  if (!task) return "未开始，无需操作。";
  if (
    action === "stop" &&
    task.desired === "stopped" &&
    !task.sessionId &&
    !task.cleanupSessions.length
  )
    return "已停止或已完成。";
  return "";
}

export async function batchOperate(
  manager: EncyclopediaManager,
  action: BatchAction,
  ids: number[],
  modelFor: (
    task: EntryTask | null,
  ) => Promise<{ model: string; reasoning: string }>,
): Promise<BatchItemResult[]> {
  const results = new Map<number, BatchItemResult>();
  const settingsById = new Map<number, { model: string; reasoning: string }>();
  // 先解析轻量设置，事务内不等待网络，也不启动实际采集。
  for (const id of ids) {
    if (action === "stop") continue;
    try {
      const task = manager.store?.getSummary(id) ?? manager.get(id);
      const reason = skipReason(task, action);
      if (reason) results.set(id, { id, status: "skipped", reason });
      else {
        assertCurrentTaskProtocol(manager);
        settingsById.set(id, await modelFor(task));
      }
    } catch (error) {
      results.set(id, { id, status: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const ordered = action === "continue" ? orderBatchIds(manager, ids) : ids;
  function apply() {
    for (const id of ordered) {
      if (results.has(id)) continue;
      try {
        let task = manager.store?.getSummary(id) ?? manager.get(id);
        const reason = skipReason(task, action);
        if (reason) {
          results.set(id, { id, status: "skipped", reason });
          continue;
        }
        if (action === "stop") task = manager.requestStop(id);
        else {
          const settings = settingsById.get(id)!;
          if (action === "configure") task = manager.configure(id, settings.model, settings.reasoning);
          else task = manager.start(id, settings.model, settings.reasoning, action);
        }
        results.set(id, { id, status: "success", reason: task?.message || "操作已接受。" });
      } catch (error) {
        results.set(id, { id, status: "failed", reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (manager.applyBatch) manager.applyBatch(apply);
  else apply();
  return ids.map(function result(id) { return results.get(id)!; });
}
