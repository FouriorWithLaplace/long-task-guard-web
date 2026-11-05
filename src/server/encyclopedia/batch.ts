import type {
  BatchAction,
  BatchItemResult,
  EntryTask,
} from "../../types/encyclopedia.ts";
import type { EncyclopediaManager } from "./manager.ts";

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
  if (!["continue", "restart", "stop"].includes(action))
    throw new Error("不支持的批量操作。");
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 50 ||
    ids.some(function invalid(id) {
      return !Number.isSafeInteger(id) || id <= 0;
    })
  )
    throw new Error("每批需要 1 至 50 个有效词条 ID。");
  return { action, ids: [...new Set(ids)] };
}

function skipReason(task: EntryTask | null, action: BatchAction) {
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
      let task = manager.get(id);
      let reason = skipReason(task, action);
      if (reason) return { id, status: "skipped", reason };
      if (action === "continue" || action === "restart") {
        assertCurrentTaskProtocol(manager);
        const settings = await modelFor(task);
        // 模型读取期间，单条按钮可能已经改变任务状态。
        task = manager.get(id);
        reason = skipReason(task, action);
        if (reason) return { id, status: "skipped", reason };
        task = manager.start(id, settings.model, settings.reasoning, action);
      } else task = await manager.stop(id);
      if (task?.unconfirmed || task?.phase === "blocked")
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
  // 每批最多 50 条；调度器仍只启动 2 个采集执行。
  return Promise.all(ids.map(operate));
}
