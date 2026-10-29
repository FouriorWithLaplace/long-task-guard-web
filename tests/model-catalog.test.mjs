import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Replace only the child process boundary. No real Codex or inference runs.
test("model catalog: explicit refresh, persistence, pagination and failure recovery", async function (t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "guard-model-test-"));
  const previousDirectory = process.env.LONG_TASK_GUARD_DATA_DIR;
  const previousExecutable = process.env.LONG_TASK_GUARD_CODEX_PATH;
  process.env.LONG_TASK_GUARD_DATA_DIR = directory;
  process.env.LONG_TASK_GUARD_CODEX_PATH = process.execPath;
  let mode = "success";
  let starts = 0;
  let kills = 0;
  const methods = [];
  const fixture = {
    model: "model-a", displayName: "Model A", isDefault: true,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Low effort" },
      { reasoningEffort: "medium", description: "Medium effort" },
    ],
  };

  const mock = t.mock.method(childProcess, "spawn", function fakeSpawn(executable, args, options) {
    starts++;
    assert.equal(executable, process.execPath);
    assert.deepEqual(args, ["--no-daemon", "app-server", "--listen", "stdio://"]);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        const request = JSON.parse(chunk.toString());
        methods.push(request.method);
        queueMicrotask(function reply() {
          if (request.method === "initialized") return;
          let response;
          if (request.method === "initialize") {
            response = { id: request.id, result: {} };
          } else if (mode === "error") {
            response = { id: request.id, error: { message: "catalog unavailable" } };
          } else if (mode === "malformed") {
            response = null;
          } else if (request.params.cursor === null) {
            response = { id: request.id, result: { data: [fixture], nextCursor: "page-two" } };
          } else {
            assert.equal(request.params.cursor, "page-two");
            response = { id: request.id, result: { data: [fixture, { ...fixture, model: "model-b", isDefault: false }], nextCursor: null } };
          }
          child.stdout.write(JSON.stringify(response) + "\n");
        });
        callback();
      },
    });
    child.kill = function kill() {
      kills++;
      child.stdout.end();
      child.stderr.end();
      queueMicrotask(function close() { child.emit("close", 0); });
      return true;
    };
    return child;
  });
  syncBuiltinESMExports();

  try {
    const service = await import("../src/server/model-catalog.ts");
    const cachePath = path.join(directory, "model-catalog.json");

    await t.test("empty cache reads never launch Codex", async function () {
      assert.deepEqual(await service.readCachedModelCatalog(), { version: 1, updatedAt: null, models: [] });
      assert.equal(starts, 0);
      assert.deepEqual(await readdir(directory), []);
    });

    let saved;
    await t.test("concurrent refreshes use one process, paginate, deduplicate and save", async function () {
      const catalogs = await Promise.all([service.refreshModelCatalog(), service.refreshModelCatalog()]);
      assert.deepEqual(catalogs[0], catalogs[1]);
      assert.equal(starts, 1);
      assert.equal(kills, 1);
      assert.deepEqual(catalogs[0].models.map(function (model) { return model.id; }), ["model-a", "model-b"]);
      assert.equal(catalogs[0].models[0].defaultReasoningEffort, "medium");
      saved = await readFile(cachePath, "utf8");
      assert.deepEqual(JSON.parse(saved), catalogs[0]);
      assert.deepEqual(await readdir(directory), ["model-catalog.json"]);
      assert.deepEqual(methods, ["initialize", "initialized", "model/list", "model/list"]);
    });

    await t.test("reading old persistent cache never refreshes", async function () {
      const old = JSON.parse(saved);
      old.updatedAt = "2000-01-01T00:00:00.000Z";
      await writeFile(cachePath, JSON.stringify(old));
      assert.deepEqual(await service.readCachedModelCatalog(), old);
      assert.equal(starts, 1);
      await writeFile(cachePath, saved);
    });

    await t.test("failed refresh preserves existing disk data and closes process", async function () {
      mode = "error";
      await assert.rejects(service.refreshModelCatalog(), /catalog unavailable/);
      assert.equal(await readFile(cachePath, "utf8"), saved);
      assert.equal(kills, 2);
    });

    await t.test("invalid protocol is rejected without crashing or changing cache", async function () {
      mode = "malformed";
      await assert.rejects(service.refreshModelCatalog());
      assert.equal(await readFile(cachePath, "utf8"), saved);
      assert.equal(kills, 3);
    });

    await t.test("corrupt cache errors do not trigger a query; explicit refresh repairs it", async function () {
      await writeFile(cachePath, '{"version":1,"models":[null],"updatedAt":"invalid"}');
      await assert.rejects(service.readCachedModelCatalog());
      assert.equal(starts, 3);
      mode = "success";
      await service.refreshModelCatalog();
      assert.equal((await service.readCachedModelCatalog()).models.length, 2);
      assert.equal(starts, 4);
    });
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
    if (previousDirectory === undefined) delete process.env.LONG_TASK_GUARD_DATA_DIR;
    else process.env.LONG_TASK_GUARD_DATA_DIR = previousDirectory;
    if (previousExecutable === undefined) delete process.env.LONG_TASK_GUARD_CODEX_PATH;
    else process.env.LONG_TASK_GUARD_CODEX_PATH = previousExecutable;
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("guard-model-test-"));
    await rm(resolved, { recursive: true, force: true });
  }
});
