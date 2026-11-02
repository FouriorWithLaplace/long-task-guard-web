import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

test("blank guard service validates before creating and protects a late session binding", async function (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guard-service-"));
  const cachePath = path.join(directory, "model-catalog.json");
  const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url));
  const previousDataDirectory = process.env.LONG_TASK_GUARD_DATA_DIR;
  const previousCodexDirectory = process.env.CODEX_HOME;
  const previousManager = globalThis.longTaskGuardManager;
  process.env.LONG_TASK_GUARD_DATA_DIR = directory;
  process.env.CODEX_HOME = directory;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        const url = pathToFileURL(path.join(sourceDirectory, specifier.slice(2) + ".ts"));
        return nextResolve(url.href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(function cleanup() {
    hooks.deregister();
    if (previousDataDirectory === undefined) delete process.env.LONG_TASK_GUARD_DATA_DIR;
    else process.env.LONG_TASK_GUARD_DATA_DIR = previousDataDirectory;
    if (previousCodexDirectory === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexDirectory;
    if (previousManager === undefined) delete globalThis.longTaskGuardManager;
    else globalThis.longTaskGuardManager = previousManager;
    fs.unlinkSync(cachePath);
    fs.rmdirSync(directory);
  });
  fs.writeFileSync(cachePath, JSON.stringify({
    version: 1, updatedAt: new Date().toISOString(),
    models: [{ id: "test-model", name: "Test", description: "Test model", isDefault: true, defaultReasoningEffort: "high", reasoningEfforts: [{ value: "high", description: "High" }] }],
  }));
  const settings = { sessionId: "", model: "test-model", reasoning: "high", startMessage: "First prompt", retryMessage: "Retry", completeMessage: "Continue" };
  const calls = [];
  let current = { phase: "paused", deleting: false, runId: 1, settings: { ...settings }, projectPath: directory };
  globalThis.longTaskGuardManager = {
    create(selected, session) { calls.push({ method: "create", settings: selected, session: session }); return { id: "guard" }; },
    get() { return structuredClone(current); },
    start() { calls.push({ method: "start" }); return { id: "guard" }; },
  };
  const { createGuard, startGuard } = await import("../src/server/guard-service.ts");
  const { GuardManager } = await import("../src/server/guard-manager.ts");
  t.mock.method(GuardManager, "refreshPausedRunners", function refreshTestDouble() {});

  await t.test("creates without a pre-existing session database", async function () {
    const result = await createGuard(settings, { projectPath: directory });
    assert.equal(result.id, "guard");
    assert.equal(calls[0].session.id, "");
    assert.equal(calls[0].session.projectPath, fs.realpathSync(directory));
  });

  await t.test("invalid input never reaches the manager", async function () {
    const before = calls.length;
    await assert.rejects(createGuard({ ...settings, model: "unknown" }, { projectPath: directory }), /模型/);
    await assert.rejects(createGuard({ ...settings, reasoning: "unknown" }, { projectPath: directory }), /推理强度/);
    await assert.rejects(createGuard({ ...settings, startMessage: " " }, { projectPath: directory }), /开始/);
    await assert.rejects(createGuard(settings, { projectPath: "relative" }), /绝对路径/);
    await assert.rejects(createGuard({ ...settings, sessionId: "existing" }, { projectPath: directory }), /不能同时/);
    assert.equal(calls.length, before);
  });

  await t.test("an unbound paused guard can start with its saved directory", async function () {
    await startGuard("guard");
    assert.equal(calls.at(-1).method, "start");
  });

  await t.test("a late binding during validation cannot be overwritten by a blank id", async function (t) {
    let release;
    const waiting = new Promise(function wait(resolve) { release = resolve; });
    const originalReadFile = fsPromises.readFile;
    const mock = t.mock.method(fsPromises, "readFile", async function readFile(file, ...options) {
      if (file === cachePath) await waiting;
      return originalReadFile(file, ...options);
    });
    syncBuiltinESMExports();
    t.after(function restoreReadFile() { mock.mock.restore(); syncBuiltinESMExports(); });
    const before = calls.length;
    const starting = startGuard("guard");
    current = { ...current, settings: { ...settings, sessionId: "late-created-session" } };
    release();
    await assert.rejects(starting, { status: 409 });
    assert.equal(calls.length, before);
  });
});
