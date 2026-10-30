import { CodexClient } from "@/server/codex-client";
import { GuardRunner } from "@/server/guard-runner";
import { GuardEventHub } from "@/server/guard-event-hub";
import { findCodexExecutable, readCachedModelCatalog } from "@/server/model-catalog";
import { discoverSessions } from "@/server/session-scanner";
import type { GuardSettings } from "@/types/guard";

// Next.js 开发时重载模块，仍共享同一任务，避免产生重复计时器。
const guardGlobal = globalThis as typeof globalThis & {
  longTaskGuardRunner?: GuardRunner;
  longTaskGuardVersion?: number;
  longTaskGuardEvents?: GuardEventHub;
};
// 实例结构变化时递增；不同路由共享同一个实例，不通过类身份判断。
const runnerVersion = 4;

export function getGuardRunner(): GuardRunner {
  let runner = guardGlobal.longTaskGuardRunner;
  const version = guardGlobal.longTaskGuardVersion ?? 0;
  // 已暂停的旧实例可替换，让开发热更新后的下一次开始使用新业务逻辑。
  // 旧路由仍可能有未结束的请求，不能让它把较新的实例换回旧版本。
  if (!runner || (runner.snapshot().phase === "paused" && version < runnerVersion)) {
    runner = new GuardRunner(function createConnection(cwd, events) {
      return new CodexClient(findCodexExecutable(), cwd, events);
    });
    guardGlobal.longTaskGuardRunner = runner;
    guardGlobal.longTaskGuardVersion = runnerVersion;
  }

  if (!guardGlobal.longTaskGuardEvents) {
    guardGlobal.longTaskGuardEvents = new GuardEventHub(runner);
  } else {
    guardGlobal.longTaskGuardEvents.follow(runner);
  }
  return runner;
}

export function getGuardEventSource(): GuardEventHub {
  getGuardRunner();
  return guardGlobal.longTaskGuardEvents!;
}

export async function startGuard(settings: GuardSettings) {
  const sessions = discoverSessions();
  const session = sessions.find(function match(candidate) { return candidate.id === settings.sessionId; });
  if (!session) throw new Error("请选择可用会话。" );
  if (!settings.startMessage.trim()) throw new Error("请填写开始时发送的内容。" );

  // 只验证缓存，开始守护也不会额外查询模型列表。
  const catalog = await readCachedModelCatalog();
  const model = catalog.models.find(function match(candidate) { return candidate.id === settings.model; });
  if (!model) throw new Error("请选择缓存中的可用模型。" );
  const reasoning = model.reasoningEfforts.find(function match(effort) { return effort.value === settings.reasoning; });
  if (!reasoning) throw new Error("请选择该模型支持的推理强度。" );

  return getGuardRunner().start(settings, session);
}
