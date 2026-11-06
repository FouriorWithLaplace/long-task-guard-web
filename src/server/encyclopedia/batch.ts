import type {
  BatchAction,
  BatchItemResult,
  EntryTask,
} from "../../types/encyclopedia.ts";
import type { EncyclopediaManager } from "./manager.ts";
import { taskProgress } from "../../types/encyclopedia.ts";
import { completionRatio } from "../../types/entry-sort.ts";

export function parseBatchIds(value: unknown, limit = 50): number[] {
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
  async function operate(id: number): Promise<BatchItemResult> {
    try {
      let task = manager.store?.getSummary(id) ?? manager.get(id);
      let reason = skipReason(task, action);
      if (reason) return { id, status: "skipped", reason };
      if (action !== "stop") {
        assertCurrentTaskProtocol(manager);
        const settings = await modelFor(task);
        // 模型读取期间，单条按钮可能已经改变任务状态。
        task = manager.store?.getSummary(id) ?? manager.get(id);
        reason = skipReason(task, action);
        if (reason) return { id, status: "skipped", reason };
        if (action === "configure") {
          if (typeof manager.configure !== "function") throw new Error("请重启后台服务以使用模型切换功能。");
          task = manager.configure(id, settings.model, settings.reasoning);
        } else task = manager.start(id, settings.model, settings.reasoning, action);
      } else task = await manager.stop(id);
      if (action !== "configure" && (task?.unconfirmed || task?.phase === "blocked"))
        throw new Error(task.message);
      if (action === "stop" && task?.cleanupError)
        throw new Error("已停止，但会话清理待重试：" + task.cleanupError);
      return { id, status: "success", reason: task?.message || "操作完成。" };
    } catch (error) {
      return {
        id,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (action === "continue") {
    // 逐项入队，防止模型查询的返回顺序让低完成度任务抢先启动。
    // 执行仍由管理器保持并发 2，不等待单个采集任务结束。
    const results = new Map<number, BatchItemResult>();
    for (const id of orderBatchIds(manager, ids)) results.set(id, await operate(id));
    return ids.map(function result(id) { return results.get(id)!; });
  }
  // 停止和设置等操作不需要等待前一项。
  return Promise.all(ids.map(operate));
}
