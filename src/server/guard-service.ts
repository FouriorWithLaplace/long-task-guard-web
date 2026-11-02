import { CodexClient } from "@/server/codex-client";
import { GuardRunner } from "@/server/guard-runner";
import { GuardError, GuardManager } from "@/server/guard-manager";
import { findCodexExecutable, readCachedModelCatalog } from "@/server/model-catalog";
import { discoverSessions } from "@/server/session-scanner";
import { resolveProjectDirectory } from "@/server/project-directory";
import type { GuardBulkAction, GuardOperationResult, GuardSettings, NewSessionOptions, SessionSummary } from "@/types/guard";

const guardGlobal = globalThis as typeof globalThis & {
  longTaskGuardManager?: GuardManager;
  longTaskGuardRunner?: GuardRunner;
};

export function getGuardManager(): GuardManager {
  function createRunner() {
    return new GuardRunner(function createConnection(cwd, events) {
      return new CodexClient(findCodexExecutable(), cwd, events);
    });
  }
  if (!guardGlobal.longTaskGuardManager) {
    const manager = new GuardManager(createRunner);
    const previous = guardGlobal.longTaskGuardRunner;
    if (previous?.snapshot().settings) manager.adopt(previous);
    guardGlobal.longTaskGuardManager = manager;
  }
  GuardManager.refreshPausedRunners(guardGlobal.longTaskGuardManager, createRunner, GuardRunner.prototype);
  return guardGlobal.longTaskGuardManager;
}

async function validateExecutionSettings(settings: GuardSettings): Promise<void> {
  if (!settings.startMessage.trim()) throw new GuardError("请填写开始时发送的内容。");

  // 只验证缓存，开始守护也不会额外查询模型列表。
  const catalog = await readCachedModelCatalog();
  const model = catalog.models.find(function match(candidate) { return candidate.id === settings.model; });
  if (!model) throw new GuardError("请选择缓存中的可用模型。");
  const reasoning = model.reasoningEfforts.find(function match(effort) { return effort.value === settings.reasoning; });
  if (!reasoning) throw new GuardError("请选择该模型支持的推理强度。");
}

async function validateExistingSession(settings: GuardSettings): Promise<SessionSummary> {
  const sessions = discoverSessions();
  const session = sessions.find(function match(candidate) { return candidate.id === settings.sessionId; });
  if (!session) throw new GuardError("请选择可用会话。");
  await validateExecutionSettings(settings);
  return session;
}

async function validateNewSession(settings: GuardSettings, projectPath: string): Promise<SessionSummary> {
  if (settings.sessionId !== "") throw new GuardError("新建空白会话时不能同时指定已有会话 ID。");
  const directory = resolveProjectDirectory(projectPath);
  await validateExecutionSettings(settings);
  return { id: "", title: "待创建会话", projectPath: directory };
}

export async function createGuard(settings: GuardSettings, newSession?: NewSessionOptions) {
  let session: SessionSummary;
  if (newSession) session = await validateNewSession(settings, newSession.projectPath);
  else session = await validateExistingSession(settings);
  return getGuardManager().create(settings, session);
}

export async function startGuard(id: string, settings?: GuardSettings) {
  const manager = getGuardManager();
  const current = manager.get(id);
  if (!settings && current.phase !== "paused" && !current.deleting) return current;
  if (current.phase !== "paused" || current.deleting) throw new GuardError("这个守护正在执行或删除，请先暂停。", 409);
  const selected = settings ?? current.settings;
  if (!selected) throw new GuardError("这个守护还没有执行配置。");
  let session: SessionSummary;
  if (!selected.sessionId && current.settings?.sessionId === "") {
    session = await validateNewSession(selected, current.projectPath);
  } else {
    session = await validateExistingSession(selected);
  }
  // 验证缓存期间，旧的创建响应可能晚到并绑定 ID，不能再用空 ID 覆盖它。
  const latest = manager.get(id);
  if (latest.runId !== current.runId || latest.settings?.sessionId !== current.settings?.sessionId) {
    throw new GuardError("守护的会话或执行状态已变化，请确认最新配置后重新开始。", 409);
  }
  return manager.start(id, selected, session);
}

export async function operateGuards(action: GuardBulkAction, ids: string[]): Promise<GuardOperationResult[]> {
  const manager = getGuardManager();
  const uniqueIds = Array.from(new Set(ids));

  async function operate(id: string): Promise<GuardOperationResult> {
    try {
      if (action === "start") await startGuard(id);
      if (action === "pause") await manager.pause(id);
      if (action === "delete") await manager.remove(id);
      return { id: id, success: true };
    } catch (error) {
      let message = "守护操作失败。";
      if (error instanceof Error) message = error.message;
      return { id: id, success: false, error: message };
    }
  }

  return Promise.all(uniqueIds.map(operate));
}
