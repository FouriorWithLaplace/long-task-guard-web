import { CodexClient } from "@/server/codex-client";
import { GuardRunner } from "@/server/guard-runner";
import { GuardError, GuardManager } from "@/server/guard-manager";
import { findCodexExecutable, readCachedModelCatalog } from "@/server/model-catalog";
import { discoverSessions } from "@/server/session-scanner";
import type { GuardBulkAction, GuardOperationResult, GuardSettings } from "@/types/guard";

const guardGlobal = globalThis as typeof globalThis & {
  longTaskGuardManager?: GuardManager;
  longTaskGuardRunner?: GuardRunner;
};

export function getGuardManager(): GuardManager {
  if (!guardGlobal.longTaskGuardManager) {
    const manager = new GuardManager(function createRunner() {
      return new GuardRunner(function createConnection(cwd, events) {
        return new CodexClient(findCodexExecutable(), cwd, events);
      });
    });
    const previous = guardGlobal.longTaskGuardRunner;
    if (previous?.snapshot().settings) manager.adopt(previous);
    guardGlobal.longTaskGuardManager = manager;
  }
  return guardGlobal.longTaskGuardManager;
}

async function validateSettings(settings: GuardSettings) {
  const sessions = discoverSessions();
  const session = sessions.find(function match(candidate) { return candidate.id === settings.sessionId; });
  if (!session) throw new GuardError("请选择可用会话。");
  if (!settings.startMessage.trim()) throw new GuardError("请填写开始时发送的内容。");

  // 只验证缓存，开始守护也不会额外查询模型列表。
  const catalog = await readCachedModelCatalog();
  const model = catalog.models.find(function match(candidate) { return candidate.id === settings.model; });
  if (!model) throw new GuardError("请选择缓存中的可用模型。");
  const reasoning = model.reasoningEfforts.find(function match(effort) { return effort.value === settings.reasoning; });
  if (!reasoning) throw new GuardError("请选择该模型支持的推理强度。");

  return session;
}

export async function createGuard(settings: GuardSettings) {
  const session = await validateSettings(settings);
  return getGuardManager().create(settings, session);
}

export async function startGuard(id: string, settings?: GuardSettings) {
  const manager = getGuardManager();
  const current = manager.get(id);
  if (!settings && current.phase !== "paused" && !current.deleting) return current;
  const selected = settings ?? current.settings;
  if (!selected) throw new GuardError("这个守护还没有执行配置。");
  const session = await validateSettings(selected);
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
