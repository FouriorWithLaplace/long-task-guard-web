import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  readCategories,
  readDetail,
  readEntries,
  readCategoryFieldMarkdown,
  originalPath,
} from "../src/server/encyclopedia/database.ts";
import { TaskStore } from "../src/server/encyclopedia/store.ts";
import {
  EntryWriter,
  parseFieldResult,
} from "../src/server/encyclopedia/writer.ts";
import { EncyclopediaManager } from "../src/server/encyclopedia/manager.ts";
import { assertCurrentTaskProtocol, batchOperate, parseBatch } from "../src/server/encyclopedia/batch.ts";
import { fieldProgress, taskProgress, hasFieldValue, processedFieldKeys, taskFilterGroup, taskFilters } from "../src/types/encyclopedia.ts";

test("legacy task snapshots render confirmed progress without restoring explicitly reset progress", function () {
  const legacy = {
    scope: ["fields.publisher", "fields.notes"],
    results: {
      "fields.publisher": { value: "Existing publisher", outcome: "verified", readback: true, changed: false },
      "fields.notes": { value: "Unconfirmed", outcome: "tentative", readback: false, changed: true },
    },
  };
  const fields = [
    { key: "fields.publisher", value: "Existing publisher", writable: true },
    { key: "fields.notes", value: null, writable: true },
    { key: "identity.name", value: "Read-only name", writable: false },
  ];
  const original = JSON.stringify(legacy);
  assert.deepEqual(processedFieldKeys(legacy), ["fields.publisher"]);
  assert.equal(taskProgress(legacy).checked, 1);
  assert.equal(taskProgress(legacy).percent, 50);
  assert.equal(taskProgress(legacy).filled, undefined);
  assert.deepEqual(fieldProgress(fields, legacy), { filled: 1, checked: 1, total: 2, percent: 50 });
  assert.equal(JSON.stringify(legacy), original);
  assert.deepEqual(processedFieldKeys(null), []);
  assert.deepEqual(processedFieldKeys({ results: {} }), []);

  const reset = { ...legacy, processedFields: [], filled: 1 };
  assert.deepEqual(processedFieldKeys(reset), []);
  assert.equal(taskProgress(reset).checked, 0);
  assert.equal(taskProgress(reset).filled, 1);
  assert.equal(fieldProgress(fields, reset).checked, 0);
});

test("legacy managers reject new start modes before model lookup or mutation", async function () {
  const legacyManager = {
    get() { return null; },
    start() { assert.fail("Old start must not run"); },
  };
  assert.throws(function oldProtocol() { assertCurrentTaskProtocol(legacyManager); }, /重启 npm run dev/);
  assert.doesNotThrow(function currentProtocol() { assertCurrentTaskProtocol({ taskProtocol: 3 }); });
  for (const action of ["continue", "restart"]) {
    const results = await batchOperate(legacyManager, action, [1], async function unusedModel() {
      assert.fail("Model lookup must not run");
    });
    assert.equal(results[0].status, "failed");
    assert.match(results[0].reason, /重启 npm run dev/);
  }
});

test("task groups distinguish never-started, running, complete and partial regardless of filled content", async function (t) {
  assert.deepEqual(taskFilters.map(function label(item) { return item.label; }), ["全部", "未开始", "进行中", "已完成", "完成部分"]);
  assert.equal(taskFilterGroup(null), "never");
  const config = fixture();
  const { manager, clients } = runner(t, config);
  assert.equal(fieldProgress(readDetail(config, 1).fields).filled, 3);
  assert.equal(taskFilterGroup(manager.get(1)), "never");
  manager.start(1, "test", "high");
  await settle();
  assert.equal(taskFilterGroup(manager.get(1)), "running");
  await manager.stop(1);
  assert.equal(taskFilterGroup(manager.get(1)), "partial");
  assert.equal(taskProgress(manager.get(1)).checked, 0);
  manager.start(1, "test", "high");
  await settle();
  const client = clients.at(-1);
  for (const field of readDetail(config, 1).fields) {
    if (field.writable) client.tool("submit_field", proposal(field.value, field.key));
  }
  // 即使没有调用 finish_task，停止时核对全部确认结果后也应显示已完成。
  await manager.stop(1);
  const completed = manager.get(1);
  assert.equal(taskFilterGroup(completed), "completed");
  assert.equal(completed.sessionId, null);
  assert.equal(manager.start(1, "test", "high").phase, "completed");
});

test("stop does not wait forever for an unacknowledged turn and still deletes its session", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const turnCreation = new Promise(function never() {});
  const { manager, clients, calls } = runner(t, fixture(), { turnCreation });
  manager.start(1, "test", "high");
  await settle();
  const session = manager.get(1).sessionId;
  const stopping = manager.stop(1);
  await settle();
  t.mock.timers.tick(5000);
  await stopping;
  assert.equal(clients[0].closed, true);
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(taskFilterGroup(manager.get(1)), "partial");
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === session; }));
});

test("progress counts existing content separately from processed fields and excludes protected fields", async function (t) {
  const config = fixture();
  const db = open(config);
  db.exec("UPDATE wiki_type_book SET notes=NULL; UPDATE wiki_column_fields SET collection_mode='paused' WHERE field_key='abstract'");
  db.close();
  const { manager, clients } = runner(t, config);
  const detail = readDetail(config, 1);
  assert.deepEqual(fieldProgress(detail.fields), { filled: 1, checked: 0, total: 2, percent: 0 });
  manager.start(1, "test", "high");
  await settle();
  assert.deepEqual(manager.get(1).scope, ["fields.publisher", "fields.notes"]);
  clients[0].tool("submit_field", {
    field: "fields.notes", outcome: "not_found", value: null,
    reason: "Checked the source; no notes available", nextCondition: "A new edition provides notes",
    evidence: [], candidates: [],
  });
  await manager.stop(1);
  const resumed = manager.start(1, "test", "high");
  assert.equal(taskProgress(resumed).checked, 1);
  assert.equal(taskProgress(resumed).filled, 1);
  assert.deepEqual(manager.context(1).remainingFields, ["fields.publisher"]);
  for (const value of [null, "", "  ", [], {}]) assert.equal(hasFieldValue(value), false);
  for (const value of [0, false, "hello", [0], { value: false }]) assert.equal(hasFieldValue(value), true);
});

test("repeated failures retain the slot indefinitely and stop releases it after cleanup", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { manager, clients } = runner(t, fixture());
  for (const id of [1, 2, 3]) manager.start(id, "test", "high");
  await settle();
  let failing = clients[0];
  for (let attempt = 1; attempt <= 9; attempt++) {
    failing.events.onDisconnect(new Error("Service unavailable"));
    await settle();
    const saved = manager.get(1);
    assert.equal(saved.phase, "retrying");
    assert.equal(saved.desired, "running");
    assert.equal(saved.slotHeld, true);
    assert.equal(saved.failures, attempt);
    const wait = Date.parse(saved.nextRetryAt) - Date.now();
    assert.ok(wait > 0 && wait <= 60000);
    manager.tick();
    await settle();
    assert.equal(manager.get(3).phase, "queued");
    t.mock.timers.tick(wait);
    manager.tick();
    await settle();
    assert.equal(manager.get(1).phase, "running");
    assert.equal(manager.get(3).phase, "queued");
    failing = clients.at(-1);
  }
  failing.events.onDisconnect(new Error("Again"));
  await manager.stop(1);
  await settle();
  assert.equal(manager.get(1).phase, "stopped");
  assert.equal(manager.get(1).slotHeld, false);
  assert.equal(manager.get(3).phase, "running");
  t.mock.timers.tick(60000);
  manager.tick();
  assert.equal(manager.get(1).phase, "stopped");
});

test("factory, initialization, session creation and reconciliation errors all keep retrying", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  for (const failure of ["factoryFailure", "initializeFailure", "creationFailure", "recoveryFailure"]) {
    const options = { [failure]: true };
    const { manager } = runner(t, fixture(), options);
    manager.start(1, "test", "high");
    if (failure === "recoveryFailure") {
      const original = manager.writer.recover.bind(manager.writer);
      manager.writer.recover = function recover(task) {
        if (options.recoveryFailure) throw Error("Readback temporarily unavailable");
        return original(task);
      };
    }
    await settle();
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(manager.get(1).phase, "retrying", failure);
      assert.equal(manager.get(1).desired, "running", failure);
      t.mock.timers.tick(60000);
      manager.tick();
      await settle();
    }
    options[failure] = false;
    t.mock.timers.tick(60000);
    manager.tick();
    await settle();
    assert.equal(manager.get(1).phase, "running", failure);
    manager.dispose();
  }
});

test("no-progress responses replace the session and retry without advancing the queue", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { manager, clients, calls } = runner(t, fixture());
  for (const id of [1, 2, 3]) manager.start(id, "test", "high");
  await settle();
  const client = clients[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    client.events.onNotification("turn/completed", {
      threadId: client.sessionId, turn: { id: "empty-" + attempt, status: "completed" },
    });
    t.mock.timers.tick(1500);
    await settle();
  }
  assert.equal(manager.get(1).phase, "retrying");
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(manager.get(3).phase, "queued");
  t.mock.timers.tick(60000);
  manager.tick();
  await settle();
  assert.equal(manager.get(1).phase, "running");
  assert.notEqual(manager.get(1).sessionId, client.sessionId);
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === client.sessionId; }));
});

test("restart after stop preserves values and evidence, rejects stale writes and resumes its mode", async function (t) {
  const config = fixture();
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  await settle();
  const oldClient = clients[0];
  oldClient.tool("submit_field", proposal());
  await manager.stop(1);
  const oldTask = manager.get(1);
  const reset = manager.start(1, "test", "high", "restart");
  assert.deepEqual(reset.processedFields, []);
  assert.deepEqual(reset.results, oldTask.results);
  assert.notEqual(reset.runId, oldTask.runId);
  await settle();
  oldClient.tool("submit_field", proposal("Stale", "fields.notes"));
  assert.equal(calls.at(-1).method, "reject");
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === oldClient.sessionId; }));
  await manager.stop(1);
  const resumed = manager.start(1, "test", "high");
  assert.equal(resumed.mode, "restart");
  assert.equal(resumed.runId, reset.runId);
  assert.equal(readDetail(config, 1).fields.find(function publisher(field) { return field.key === "fields.publisher"; }).value, "New publisher");
});

test("service restart reserves the failing task's slot ahead of an earlier queued ID", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const config = fixture();
  const first = runner(t, config);
  first.manager.start(2, "test", "high");
  first.manager.start(3, "test", "high");
  await settle();
  first.manager.start(1, "test", "high");
  first.clients[0].events.onDisconnect(new Error("Unavailable"));
  await settle();
  first.manager.dispose();
  const second = runner(t, config);
  await settle();
  assert.equal(second.manager.get(1).phase, "queued");
  assert.equal(second.manager.get(2).slotHeld, true);
  assert.equal(second.manager.get(3).slotHeld, true);
  t.mock.timers.tick(60000);
  second.manager.tick();
  await settle();
  assert.equal(second.manager.get(2).phase, "running");
  assert.equal(second.manager.get(1).phase, "queued");
});

test("legacy migration merges latest results, removes round snapshots and keeps audit intents", async function (t) {
  const config = fixture();
  const { store, writer, task } = harness(t, config);
  writer.submit(task, proposal());
  const legacy = { ...task, round: 2, completedRounds: 1, roundStartedAt: task.startedAt, desired: "paused", phase: "paused", sessionId: "old-session" };
  const archived = { ...legacy, results: { ...task.results } };
  legacy.results = {};
  delete legacy.processedFields;
  store.save(legacy);
  const state = new DatabaseSync(path.join(config.workspace, "panel", "state.sqlite"));
  state.exec("CREATE TABLE rounds(run_id TEXT PRIMARY KEY,entity_id INTEGER,body TEXT)");
  state.prepare("INSERT INTO rounds VALUES(?,?,?)").run("archived", 1, JSON.stringify(archived));
  const { manager } = runner(t, config);
  await settle();
  const migrated = manager.get(1);
  assert.equal(migrated.round, undefined);
  assert.equal(migrated.completedRounds, undefined);
  assert.equal(migrated.phase, "stopped");
  assert.equal(migrated.sessionId, null);
  assert.deepEqual(migrated.cleanupSessions, []);
  assert.deepEqual(migrated.processedFields, ["fields.publisher"]);
  assert.equal(migrated.results["fields.publisher"].value, "New publisher");
  assert.equal(manager.store.intents(1, false).length, 1);
  assert.equal(state.prepare("SELECT name FROM sqlite_master WHERE name='rounds'").get(), undefined);
  manager.store.migrateTasks();
  assert.deepEqual(manager.get(1), migrated);
  state.close();
});

test("unconfirmed submissions reserve the slot and do not launch work before reconciliation", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { manager, clients } = runner(t, fixture());
  manager.start(1, "test", "high");
  manager.start(2, "test", "high");
  manager.start(3, "test", "high");
  let pending = true;
  const recover = manager.writer.recover.bind(manager.writer);
  manager.writer.recover = function reconcile(task) {
    recover(task);
    if (task.entityId === 1 && pending) task.unconfirmed = 1;
  };
  await settle();
  assert.equal(manager.get(1).phase, "retrying");
  assert.equal(manager.get(3).phase, "queued");
  assert.equal(clients.length, 1);
  for (let attempt = 0; attempt < 5; attempt++) {
    t.mock.timers.tick(60000);
    manager.tick();
    await settle();
    assert.equal(clients.length, 1);
  }
  pending = false;
  t.mock.timers.tick(60000);
  manager.tick();
  await settle();
  assert.equal(manager.get(1).phase, "running");
  assert.equal(manager.get(3).phase, "queued");
});

test("batch restart resets completed and stopped tasks while skipping active tasks", async function (t) {
  const { manager } = runner(t, fixture());
  for (const id of [1, 2, 3]) manager.start(id, "test", "high");
  await settle();
  await manager.stop(1);
  await manager.stop(3);
  const completed = manager.get(3);
  completed.phase = "completed";
  completed.desired = "stopped";
  manager.store.save(completed);
  const results = await batchOperate(manager, "restart", [1, 2, 3], async function settings() {
    return { model: "test", reasoning: "high" };
  });
  assert.deepEqual(results.map(function status(item) { return item.status; }), ["success", "skipped", "success"]);
  assert.equal(manager.get(1).mode, "restart");
  assert.equal(manager.get(3).mode, "restart");
  assert.notEqual(manager.get(3).runId, completed.runId);
  assert.equal(parseBatch({ action: "restart", ids: [1] }).action, "restart");
});

const testRoot = path.resolve(
  "C:/Users/laplace/Desktop/encyclopedia-agent/tmp/panel-tests",
);
fs.mkdirSync(testRoot, { recursive: true });
const testDirectories = [];
after(function cleanupFixtures() {
  for (const root of testDirectories) {
    const resolved = fs.realpathSync(root);
    const relative = path.relative(fs.realpathSync(testRoot), resolved);
    assert.ok(
      relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    );
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
function fixture() {
  const root = fs.mkdtempSync(path.join(testRoot, "case-"));
  const config = {
    workspace: root,
    dataRoot: root,
    database: path.join(root, "encyclopedia.db"),
  };
  const db = new DatabaseSync(config.database);
  db.exec(`
    CREATE TABLE encyclopedia_workspace(id INTEGER);
    CREATE TABLE entities(id INTEGER PRIMARY KEY,name TEXT,name_en TEXT,deleted_at TEXT,ext_data TEXT,updated_at TEXT);
    CREATE TABLE wiki_entry_types(key TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE wiki_entry_profiles(entity_id INTEGER PRIMARY KEY,type_key TEXT,fields TEXT,sections TEXT,version INTEGER,state TEXT,reason TEXT,is_presentable INTEGER,updated_at TEXT);
    CREATE TABLE wiki_articles(entity_id INTEGER PRIMARY KEY,content_md TEXT,slug TEXT,version INTEGER,review_status TEXT);
    CREATE TABLE wiki_revisions(id INTEGER PRIMARY KEY,entity_id INTEGER,revision INTEGER,snapshot TEXT,editor_id INTEGER,summary TEXT,UNIQUE(entity_id,revision));
    CREATE TABLE wiki_evidence_sources(id INTEGER PRIMARY KEY,uri TEXT,source_key TEXT,fingerprint TEXT,kind TEXT,title TEXT,snapshot TEXT,UNIQUE(uri,source_key,fingerprint));
    CREATE TABLE wiki_entry_evidence(entity_id INTEGER,source_id INTEGER,field TEXT,role TEXT,locator TEXT,excerpt TEXT,PRIMARY KEY(entity_id,source_id,field,role));
    CREATE TABLE wiki_original_documents(path TEXT PRIMARY KEY,sha256 TEXT,size INTEGER,blob_path TEXT);
    CREATE TABLE wiki_entry_files(entity_id INTEGER,document_path TEXT);
    CREATE TABLE wiki_column_fields(type_key TEXT,table_name TEXT,column_name TEXT,field_key TEXT,label TEXT,group_name TEXT,storage TEXT,ordinal INTEGER,description TEXT,definition TEXT,value_type TEXT,collection_mode TEXT);
    CREATE TABLE wiki_column_value_types(entity_id INTEGER,column_name TEXT,json_type TEXT,PRIMARY KEY(entity_id,column_name));
    CREATE TABLE wiki_type_book(entity_id INTEGER PRIMARY KEY,name TEXT,publisher TEXT,notes TEXT,abstract TEXT);
    INSERT INTO wiki_entry_types VALUES('book','书籍'),('concept','科学概念');
    INSERT INTO wiki_column_fields VALUES
      ('book','wiki_type_book','name','name','书名','身份','identity',0,NULL,NULL,'text','identity_review'),
      ('book','wiki_type_book','publisher','publisher','出版社','出版','fields',1,NULL,NULL,'text',NULL),
      ('book','wiki_type_book','notes','notes','附注','出版','fields',2,NULL,NULL,'text',NULL),
      ('book','wiki_type_book','abstract','abstract','原始摘要','正文','sections',3,NULL,NULL,'text',NULL);
    CREATE TRIGGER sync_columns AFTER UPDATE ON wiki_entry_profiles BEGIN
      UPDATE wiki_type_book SET publisher=json_extract(NEW.fields,'$.publisher'),notes=json_extract(NEW.fields,'$.notes'),abstract=json_extract(NEW.sections,'$.abstract') WHERE entity_id=NEW.entity_id;
      INSERT OR REPLACE INTO wiki_column_value_types VALUES(NEW.entity_id,'publisher',json_type(NEW.fields,'$.publisher'));
      INSERT OR REPLACE INTO wiki_column_value_types VALUES(NEW.entity_id,'notes',json_type(NEW.fields,'$.notes'));
      INSERT OR REPLACE INTO wiki_column_value_types VALUES(NEW.entity_id,'abstract',json_type(NEW.sections,'$.abstract'));
    END;
    CREATE TRIGGER force_rollback BEFORE UPDATE ON wiki_entry_profiles WHEN json_extract(NEW.fields,'$.publisher')='ROLLBACK' BEGIN SELECT RAISE(ABORT,'simulated rejection'); END;
  `);
  for (let id = 1; id <= 3; id++) {
    db.prepare("INSERT INTO entities VALUES(?,?,NULL,NULL,?,NULL)").run(
      id,
      "Test book " + id,
      JSON.stringify({ keep: "unrelated data" }),
    );
    db.prepare(
      "INSERT INTO wiki_entry_profiles VALUES(?,'book',?, ?,1,'published','existing',1,NULL)",
    ).run(
      id,
      JSON.stringify({ publisher: "Old publisher" }),
      JSON.stringify({ abstract: "Original abstract" }),
    );
    db.prepare(
      "INSERT INTO wiki_articles VALUES(?,?,'slug-'||?,1,'published')",
    ).run(id, "Original abstract", id);
    db.prepare("INSERT INTO wiki_type_book VALUES(?,?,?,?,?)").run(
      id,
      "Test book " + id,
      "Old publisher",
      "Preserve extended column",
      "Original abstract",
    );
  }
  db.close();
  testDirectories.push(root);
  return config;
}
function newTask(config, id = 1) {
  const detail = readDetail(config, id);
  return {
    entityId: id,
    name: detail.name,
    type: "book",
    phase: "running",
    desired: "running",
    mode: "continue",
    processedFields: [],
    filled: fieldProgress(detail.fields).filled,
    slotHeld: true,
    queuedAt: new Date().toISOString(),
    runId: randomUUID(),
    generation: 1,
    attempt: 1,
    failures: 0,
    noProgress: 0,
    sessionId: null,
    cleanupSessions: [],
    cleanupError: "",
    model: "test",
    reasoning: "high",
    scope: detail.fields.map((f) => f.key),
    dictionaryHash: detail.dictionaryHash,
    skillHash: "test",
    results: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextRetryAt: null,
    message: "test",
    unconfirmed: 0,
  };
}
function proposal(value = "New publisher", field = "fields.publisher") {
  return {
    field,
    outcome: "verified",
    value,
    reason: "Same edition, copyright page checked",
    nextCondition: "",
    candidates: [],
    evidence: [
      {
        uri: "https://example.org/book",
        title: "Test source",
        snapshot: "Published by " + value,
        excerpt: value,
        locator: "Copyright page",
      },
    ],
  };
}
function open(config) {
  return new DatabaseSync(config.database);
}
function harness(t, config) {
  const store = new TaskStore(config);
  t.after(() => store.close());
  const writer = new EntryWriter(config, store);
  const task = newTask(config);
  store.save(task);
  return { store, writer, task };
}

test("status filtering happens before pagination and cross-page selection uses the same search", function () {
  const config = fixture();
  const db = open(config);
  for (let id = 4; id <= 65; id++) {
    db.prepare("INSERT INTO entities VALUES(?, ?, NULL, NULL, '{}', NULL)").run(
      id,
      "Book " + id,
    );
    db.prepare(
      "INSERT INTO wiki_entry_profiles VALUES(?,'book','{}','{}',1,'pending',NULL,0,NULL)",
    ).run(id);
  }
  db.exec("UPDATE entities SET deleted_at='deleted' WHERE id=65");
  db.close();
  const phases = new Map();
  for (let id = 1; id <= 35; id++) phases.set(id, "stopped");
  phases.set(1, "stopped");
  phases.set(40, "completed");
  phases.set(41, "running");
  const page = readEntries(config, "book", "", 2, "partial", phases);
  assert.equal(page.total, 35);
  assert.deepEqual(
    page.entries.map((entry) => entry.id),
    [31, 32, 33, 34, 35],
  );
  const all = readEntries(config, "book", "", 1, "partial", phases, true);
  assert.equal(all.ids.length, 35);
  assert.equal(
    readEntries(config, "book", "", 1, "completed", phases).total,
    1,
  );
  assert.equal(readEntries(config, "book", "", 1, "never", phases).total, 27);
  assert.deepEqual(
    readEntries(config, "book", "Book 3", 1, "partial", phases, true).ids,
    [3, 30, 31, 32, 33, 34, 35],
  );
  assert.equal(
    readEntries(config, "entry", "", 1, "partial", phases, true).total,
    0,
  );
  assert.throws(
    () => readEntries(config, "book", "", 1, "unknown", phases),
    /筛选/,
  );
  phases.set(42, "queued");
  phases.set(43, "starting");
  phases.set(44, "retrying");
  phases.set(45, "stopping");
  phases.set(46, "stopped");
  phases.set(47, { phase: "blocked", desired: "paused" });
  phases.set(48, { phase: "error", desired: "paused" });
  phases.set(49, { phase: "blocked", desired: "stopped" });
  phases.set(50, { phase: "error", desired: "stopped" });
  phases.set(51, { phase: "blocked", desired: "running" });
  phases.set(52, { phase: "error", desired: "running" });
  assert.deepEqual(readEntries(config, "book", "", 1, "running", phases, true).ids, [41, 42, 43, 44, 45, 51, 52]);
  const paused = readEntries(config, "book", "", 2, "partial", phases);
  assert.equal(paused.total, 40);
  assert.deepEqual(paused.entries.map(function id(entry) { return entry.id; }), [31, 32, 33, 34, 35, 46, 47, 48, 49, 50]);
  assert.equal(readEntries(config, "book", "", 1, "partial", phases, true).ids.length, 40);
  for (const removed of ["paused", "stopped", "unfinished", "queued", "starting", "retrying", "pausing", "stopping", "blocked", "error"]) {
    assert.throws(function oldFilter() { readEntries(config, "book", "", 1, removed, phases); }, /筛选/);
  }
});

test("category field markdown includes all subtype fields and marks protected fields", function () {
  const config = fixture();
  const markdown = readCategoryFieldMarkdown(config, "book");
  assert.match(markdown, /^# 书籍字段表/m);
  assert.match(markdown, /\| 子类型 \| 字段键 \| 字段名称/);
  assert.match(markdown, /\| book \| fields\.publisher \| 出版社/);
  assert.match(markdown, /\| book \| identity\.name \| 书名/);
  assert.match(markdown, /\| identity_review \| 否 \|/);
  assert.match(markdown, /\| fields \|/);
  assert.throws(function unknownCategory() {
    readCategoryFieldMarkdown(config, "unknown");
  }, /分类/);
});

test("stop deletes the session, preserves confirmed fields, and start continues in a new session", async function (t) {
  const { manager, clients, calls } = runner(t, fixture());
  for (const id of [1, 2, 3]) manager.start(id, "test", "high");
  await settle();
  clients[0].tool("submit_field", proposal());
  const before = manager.get(1);
  await manager.stop(1);
  await settle();
  const stopped = manager.get(1);
  assert.equal(stopped.sessionId, null);
  assert.equal(taskFilterGroup(stopped), "partial");
  assert.equal(taskProgress(stopped).checked, 1);
  assert.equal(manager.get(3).phase, "running");
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === before.sessionId; }));
  clients[0].tool("submit_field", proposal("Late write", "fields.notes"));
  assert.equal(calls.at(-1).method, "reject");
  await manager.stop(2);
  manager.start(1, "test", "high");
  await settle();
  assert.equal(manager.get(1).runId, before.runId);
  assert.notEqual(manager.get(1).sessionId, before.sessionId);
  assert.equal(manager.get(1).results["fields.publisher"].readback, true);
  assert.ok(!manager.context(1).remainingFields.includes("fields.publisher"));
});

test("legacy paused tasks become stopped and their sessions are deleted without starting work", async function (t) {
  const config = fixture();
  const store = new TaskStore(config);
  const legacy = newTask(config);
  legacy.phase = "paused";
  legacy.desired = "paused";
  legacy.sessionId = "retained-session";
  store.save(legacy);
  store.close();
  const { manager, calls } = runner(t, config);
  await settle();
  assert.equal(manager.get(1).desired, "stopped");
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(taskFilterGroup(manager.get(1)), "partial");
  assert.equal(taskProgress(manager.get(1)).checked, 0);
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === "retained-session"; }));
  assert.ok(!calls.some(function started(call) { return call.method === "turn/start" || call.method === "thread/start"; }));
});

test("stop during creation waits for the late session and deletes it without sending a turn", async function (t) {
  let resolve;
  const creation = new Promise(function pending(done) { resolve = done; });
  const { manager, calls } = runner(t, fixture(), { creation });
  manager.start(1, "test", "high");
  await settle();
  const stopped = manager.stop(1);
  assert.equal(manager.get(1).phase, "stopping");
  manager.start(1, "test", "high", "restart");
  assert.equal(manager.get(1).phase, "stopping");
  resolve();
  await stopped;
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(manager.get(1).phase, "stopped");
  assert.ok(!calls.some(function started(call) { return call.method === "turn/start"; }));
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete"; }));
});

test("stop waits for a late turn response and interrupts that exact turn", async function (t) {
  let resolve;
  const turnCreation = new Promise((done) => {
    resolve = done;
  });
  const { manager, calls } = runner(t, fixture(), { turnCreation });
  manager.start(1, "test", "high");
  await settle();
  const paused = manager.stop(1);
  await settle();
  assert.equal(manager.get(1).phase, "stopping");
  resolve();
  await paused;
  assert.ok(
    calls.some(
      (call) =>
        call.method === "turn/interrupt" && call.params.turnId === "turn-2",
    ),
  );
  assert.equal(manager.get(1).phase, "stopped");
});

test("repeated stop requests both wait for session deletion", async function (t) {
  let resolve;
  const interruption = new Promise((done) => {
    resolve = done;
  });
  const { manager, calls } = runner(t, fixture(), { interruption });
  manager.start(1, "test", "high");
  await settle();
  const paused = manager.stop(1);
  await settle();
  const stopped = manager.stop(1);
  assert.equal(manager.get(1).phase, "stopping");
  resolve();
  await Promise.all([paused, stopped]);
  assert.equal(manager.get(1).phase, "stopped");
  assert.equal(manager.get(1).sessionId, null);
  assert.ok(calls.some((call) => call.method === "thread/delete"));
});

test("stop deletes the session even when database reconciliation fails", async function (t) {
  const { manager, calls } = runner(t, fixture());
  manager.start(1, "test", "high");
  await settle();
  const session = manager.get(1).sessionId;
  const recover = t.mock.method(EntryWriter.prototype, "recover", function unavailable() {
    throw new Error("Database temporarily unavailable");
  });
  await manager.stop(1);
  assert.equal(manager.get(1).phase, "blocked");
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(taskFilterGroup(manager.get(1)), "partial");
  assert.ok(calls.some(function deleted(call) { return call.method === "thread/delete" && call.params.threadId === session; }));
  recover.mock.restore();
  manager.start(1, "test", "high");
  await settle();
  assert.equal(manager.get(1).phase, "running");
});

test("batch validation deduplicates IDs and rejects malformed or oversized requests", function () {
  assert.deepEqual(parseBatch({ action: "continue", ids: [2, 1, 2] }).ids, [2, 1]);
  for (const body of [
    { action: "start", ids: [1] },
    { action: "pause", ids: [1] },
    { action: "stop", ids: [] },
    { action: "stop", ids: ["1"] },
    { action: "stop", ids: Array(51).fill(1) },
  ])
    assert.throws(() => parseBatch(body));
});

test("batch continues eligible entries, skips completed entries, isolates failures and respects two slots", async function (t) {
  const config = fixture();
  const { manager, clients } = runner(t, config);
  async function modelFor() {
    return { model: "test", reasoning: "high" };
  }
  const results = await batchOperate(
    manager,
    "continue",
    [1, 9999, 2, 3],
    modelFor,
  );
  await settle();
  assert.deepEqual(
    results.map((result) => result.status),
    ["success", "failed", "success", "success"],
  );
  assert.equal(clients.length, 2);
  assert.equal(manager.get(3).phase, "queued");
  await batchOperate(manager, "stop", [1, 2, 3], modelFor);
  assert.equal(manager.get(3).phase, "stopped");
  const completed = manager.get(3);
  completed.phase = "completed";
  completed.desired = "stopped";
  manager.store.save(completed);
  assert.equal(manager.store.phases().get(3), "completed");
  const next = await batchOperate(manager, "continue", [1, 3], modelFor);
  assert.deepEqual(
    next.map((result) => result.status),
    ["success", "skipped"],
  );
  assert.equal(manager.get(3).runId, completed.runId);
  await batchOperate(manager, "stop", [1, 2], modelFor);
  const skip = await batchOperate(manager, "stop", [1, 2, 9000], modelFor);
  assert.ok(skip.every((result) => result.status === "skipped"));
});

test("database readers map all types into nine groups and preserve current fields", function (t) {
  const config = fixture(t);
  const groups = readCategories(config);
  assert.equal(groups.length, 9);
  assert.equal(
    groups.reduce((sum, g) => sum + g.total, 0),
    3,
  );
  assert.deepEqual(groups.find((g) => g.key === "entry").types, ["concept"]);
  assert.equal(readEntries(config, "book", "%").total, 0);
  assert.equal(readEntries(config, "book", "1").entries[0].id, 1);
  assert.equal(
    readDetail(config, 1).fields.find((f) => f.key === "fields.notes").value,
    "Preserve extended column",
  );
  assert.equal(
    originalPath(config, "originals\\sample.bin"),
    path.join(config.dataRoot, "originals", "sample.bin"),
  );
  assert.throws(() => originalPath(config, "..\\outside"), /不合法/);
});

test("writer atomically adopts, preserves unrelated fields, hides publication, reads back and deduplicates", function (t) {
  const config = fixture(t);
  const { store, writer, task } = harness(t, config);
  const result = writer.submit(task, proposal());
  assert.equal(result.readback, true);
  assert.equal(result.changed, true);
  assert.equal(task.unconfirmed, 0);
  const db = open(config);
  const profile = db
    .prepare("SELECT * FROM wiki_entry_profiles WHERE entity_id=1")
    .get();
  assert.equal(profile.version, 2);
  assert.equal(profile.state, "pending");
  assert.equal(profile.is_presentable, 0);
  assert.equal(JSON.parse(profile.fields).notes, "Preserve extended column");
  const ext = JSON.parse(
    db.prepare("SELECT ext_data FROM entities WHERE id=1").get().ext_data,
  );
  assert.equal(ext.keep, "unrelated data");
  assert.equal(ext.encyclopedia_hidden, true);
  assert.equal(db.prepare("SELECT count(*) n FROM wiki_revisions").get().n, 1);
  writer.submit(task, proposal());
  assert.equal(
    db
      .prepare("SELECT version FROM wiki_entry_profiles WHERE entity_id=1")
      .get().version,
    2,
  );
  assert.equal(store.intents(1, false)[0].status, "confirmed");
  db.close();
});

test("transaction failure rolls back all business records; recovery confirms not committed", function (t) {
  const config = fixture(t);
  const { store, writer, task } = harness(t, config);
  assert.throws(
    () => writer.submit(task, proposal("ROLLBACK")),
    /simulated rejection/,
  );
  const db = open(config);
  assert.equal(
    db
      .prepare("SELECT version FROM wiki_entry_profiles WHERE entity_id=1")
      .get().version,
    1,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM wiki_evidence_sources").get().n,
    0,
  );
  db.close();
  writer.recover(task);
  assert.equal(task.unconfirmed, 0);
  assert.equal(store.intents(1, false)[0].status, "not_committed");
});

test("crash after commit is reconciled from transaction audit without replaying the write", function (t) {
  const config = fixture(t);
  const { store, writer, task } = harness(t, config);
  const save = store.saveIntent.bind(store);
  let fail = true;
  store.saveIntent = function (intent) {
    if (fail && intent.status === "confirmed") {
      fail = false;
      throw Error("simulated crash after commit");
    }
    return save(intent);
  };
  assert.throws(() => writer.submit(task, proposal()), /simulated crash/);
  const recovered = store.get(1);
  assert.equal(Object.keys(recovered.results).length, 0);
  writer.recover(recovered);
  assert.equal(recovered.results["fields.publisher"].readback, true);
  assert.equal(readDetail(config, 1).version, 2);
  assert.equal(recovered.unconfirmed, 0);
});

test("unresolved research preserves current values and requires evidence for adopted values", function (t) {
  const config = fixture(t);
  const { writer, task } = harness(t, config);
  assert.throws(
    () => parseFieldResult({ ...proposal(), evidence: [] }),
    /证据/,
  );
  assert.throws(
    () => writer.submit(task, proposal("Another name", "identity.name")),
    /身份字段/,
  );
  const result = writer.submit(task, {
    field: "fields.publisher",
    outcome: "not_found",
    value: null,
    reason: "Catalog unavailable; no matching local original",
    nextCondition: "Publisher catalog becomes accessible",
    evidence: [],
    candidates: [],
  });
  assert.equal(result.value, "Old publisher");
  assert.equal(result.changed, false);
  assert.equal(readDetail(config, 1).version, 1);
});

test("dictionary changes and excluded entries cannot be silently written", function (t) {
  const config = fixture(t);
  const { writer, task } = harness(t, config);
  const db = open(config);
  db.exec(
    "UPDATE wiki_column_fields SET description='New rule' WHERE field_key='publisher'",
  );
  db.close();
  assert.throws(() => writer.submit(task, proposal()), /规则已变化/);
});

async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
function runner(t, config, options = {}) {
  const clients = [];
  const calls = [];
  let sequence = 0;
  const manager = new EncyclopediaManager(
    config,
    function factory(events) {
      if (options.factoryFailure) throw Error("Simulated connection factory failure");
      const client = {
        events,
        sessionId: null,
        closed: false,
        async initialize() {
          if (options.initializeFailure) throw Error("Simulated connection initialization failure");
        },
        async request(method, params) {
          calls.push({ method, params });
          if (method === "thread/start") {
            if (options.creationFailure) throw Error("Simulated session creation failure");
            if (options.creation) await options.creation;
            client.sessionId = "session-" + ++sequence;
            return {
              thread: { id: client.sessionId, status: { type: "idle" } },
            };
          }
          if (method === "thread/resume") {
            client.sessionId = params.threadId;
            return {
              thread: { id: params.threadId, status: { type: "idle" } },
            };
          }
          if (method === "turn/start") {
            if (options.turnCreation) await options.turnCreation;
            const id = "turn-" + ++sequence;
            events.onNotification("turn/started", {
              threadId: client.sessionId,
              turn: { id },
            });
            return { turn: { id } };
          }
          if (method === "thread/delete" && options.deleteFailure)
            throw Error("Simulated cleanup failure");
          if (method === "turn/interrupt" && options.interruption)
            await options.interruption;
          if (method === "turn/interrupt" || method === "thread/delete")
            return {};
          throw Error("Unexpected " + method);
        },
        respond(id, result) {
          calls.push({ method: "response", id, result });
        },
        rejectRequest(id, message) {
          calls.push({ method: "reject", id, message });
        },
        close() {
          client.closed = true;
        },
        tool(name, args = {}) {
          events.onRequest("tool-" + ++sequence, "item/tool/call", {
            threadId: client.sessionId,
            tool: name,
            arguments: args,
          });
        },
      };
      clients.push(client);
      return client;
    },
    "Test skill",
    false,
  );
  t.after(() => manager.dispose());
  return { manager, clients, calls };
}

test("per-entry scheduling limits concurrency, rejects late writes, and stopping does not auto-resume", async function (t) {
  const config = fixture(t);
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  manager.start(2, "test", "high");
  manager.start(3, "test", "high");
  await settle();
  assert.equal(clients.length, 2);
  assert.equal(manager.get(3).phase, "queued");
  assert.equal(
    calls.find((c) => c.method === "thread/start").params.sandbox,
    "read-only",
  );
  clients[0].tool("submit_field", proposal());
  assert.equal(manager.get(1).results["fields.publisher"].readback, true);
  await manager.stop(1);
  await settle();
  assert.equal(manager.get(1).phase, "stopped");
  assert.equal(clients.length, 3);
  clients[0].tool("submit_field", proposal("Late value", "fields.notes"));
  assert.equal(calls.at(-1).method, "reject");
  assert.equal(
    readDetail(config, 1).fields.find((f) => f.key === "fields.notes").value,
    "Preserve extended column",
  );
  assert.ok(calls.some((c) => c.method === "thread/delete"));
  manager.start(1, "test", "high");
  assert.equal(manager.get(1).mode, "continue");
  assert.equal(manager.get(1).results["fields.publisher"].readback, true);
});

test("normal response completion does not finish an incomplete task", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const config = fixture(t);
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  await settle();
  const client = clients[0];
  const turn = calls.find((c) => c.method === "turn/start");
  assert.ok(turn);
  client.events.onNotification("turn/completed", {
    threadId: client.sessionId,
    turn: { id: "turn-2", status: "completed" },
  });
  assert.equal(manager.get(1).processedFields.length, 0);
  assert.equal(manager.get(1).desired, "running");
  t.mock.timers.tick(1500);
  await settle();
  assert.equal(calls.filter((c) => c.method === "turn/start").length, 2);
  await manager.stop(1);
  t.mock.timers.tick(10000);
  await settle();
  assert.equal(calls.filter((c) => c.method === "turn/start").length, 2);
});

test("finish requires every writable field; continue keeps completed results and restart resets only progress", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const config = fixture(t);
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  await settle();
  const client = clients[0];
  client.tool("finish_task");
  assert.equal(calls.at(-1).result.success, false);
  for (const field of readDetail(config, 1).fields) {
    if (field.writable) client.tool("submit_field", proposal(field.value, field.key));
  }
  client.tool("finish_task");
  assert.equal(calls.at(-1).result.success, true);
  t.mock.timers.tick(250);
  await settle();
  assert.equal(manager.get(1).phase, "completed");
  assert.equal(taskProgress(manager.get(1)).checked, 3);
  assert.equal(manager.get(1).sessionId, null);
  const second = manager.start(1, "test", "high");
  assert.equal(second.phase, "completed");
  assert.equal(Object.keys(second.results).length, 3);
  const restarted = manager.start(1, "test", "high", "restart");
  assert.notEqual(restarted.runId, second.runId);
  assert.equal(restarted.processedFields.length, 0);
  assert.equal(Object.keys(restarted.results).length, 3);
  assert.equal(restarted.filled, 3);
  assert.equal(restarted.mode, "restart");
  await settle();
  clients.at(-1).tool("submit_field", proposal("Corrected publisher"));
  assert.equal(manager.get(1).results["fields.publisher"].value, "Corrected publisher");
});

test("restart restores saved field results and never restarts a manually stopped task", async function (t) {
  const config = fixture(t);
  const first = runner(t, config);
  first.manager.start(1, "test", "high");
  await settle();
  first.clients[0].tool("submit_field", proposal());
  await first.manager.stop(1);
  const saved = first.manager.get(1);
  assert.equal(saved.phase, "stopped");
  // Expire the service lease to simulate an ungraceful service restart.
  const state = new DatabaseSync(
    path.join(config.workspace, "panel", "state.sqlite"),
  );
  state.exec("UPDATE service_lease SET expires_at=0");
  state.close();
  const second = runner(t, config);
  await settle();
  assert.equal(second.clients.length, 0);
  assert.equal(
    second.manager.get(1).results["fields.publisher"].readback,
    true,
  );
  second.manager.start(1, "test", "high");
  await settle();
  assert.equal(second.manager.get(1).runId, saved.runId);
  assert.equal(second.manager.get(1).attempt, 2);
});

test("writer works with the real book fixed-column schema and synchronization triggers in an isolated database", function (t) {
  const sourcePath =
    "C:/Users/laplace/Desktop/FusionNexus/portal/data/encyclopedia-workspace/encyclopedia.db";
  if (!fs.existsSync(sourcePath)) {
    t.skip("Local encyclopedia database not installed");
    return;
  }
  const root = fs.mkdtempSync(path.join(testRoot, "real-schema-"));
  testDirectories.push(root);
  const config = {
    workspace: root,
    dataRoot: root,
    database: path.join(root, "encyclopedia.db"),
  };
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const target = new DatabaseSync(config.database);
  target.exec("BEGIN");
  const required = [
    "encyclopedia_workspace",
    "entities",
    "wiki_entry_types",
    "wiki_entry_profiles",
    "wiki_articles",
    "wiki_revisions",
    "users",
    "wiki_evidence_sources",
    "wiki_entry_evidence",
    "wiki_original_documents",
    "wiki_entry_files",
    "wiki_column_fields",
    "wiki_column_value_types",
    "wiki_type_book",
  ];
  try {
    for (const name of required) {
      const schema = source
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
      target.exec(schema.sql);
    }
    function copy(name, where = "", params = []) {
      for (const row of source
        .prepare("SELECT * FROM " + name + where)
        .all(...params)) {
        const keys = Object.keys(row);
        target
          .prepare(
            "INSERT INTO " +
              name +
              "(" +
              keys.map((k) => '"' + k + '"').join(",") +
              ") VALUES(" +
              keys.map(() => "?").join(",") +
              ")",
          )
          .run(...Object.values(row));
      }
    }
    copy("wiki_entry_types");
    copy("wiki_column_fields");
    copy("entities", " WHERE id=1909");
    copy("wiki_entry_profiles", " WHERE entity_id=1909");
    copy("wiki_articles", " WHERE entity_id=1909");
    copy("wiki_type_book", " WHERE entity_id=1909");
    copy("wiki_column_value_types", " WHERE entity_id=1909");
    for (const row of source
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name IN ('wiki_columns_book_update','wiki_columns_book_reverse','wiki_columns_known_update')",
      )
      .all())
      target.exec(row.sql);
    target.exec("COMMIT");
  } finally {
    source.close();
    target.close();
  }
  const store = new TaskStore(config);
  t.after(() => store.close());
  const task = newTask(config, 1909);
  store.save(task);
  const writer = new EntryWriter(config, store);
  const before = readDetail(config, 1909);
  const result = writer.submit(task, proposal("Isolated test publisher"));
  const after = readDetail(config, 1909);
  assert.equal(result.readback, true);
  assert.ok(after.version > before.version);
  for (const field of before.fields) {
    if (field.key !== "fields.publisher")
      assert.deepEqual(
        after.fields.find((f) => f.key === field.key).value,
        field.value,
        field.key + " preserved",
      );
  }
});

test("context replacement keeps the same task and confirmed fields", async function (t) {
  t.mock.timers.enable({ apis: ["Date"] });
  const config = fixture(t);
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  await settle();
  clients[0].tool("submit_field", proposal());
  const original = manager.get(1);
  clients[0].events.onDisconnect(Error("HTTP 413 payload too large"));
  await settle();
  assert.equal(manager.get(1).phase, "retrying");
  assert.equal(manager.get(1).sessionId, null);
  t.mock.timers.tick(5001);
  manager.tick();
  await settle();
  const resumed = manager.get(1);
  assert.equal(resumed.runId, original.runId);
  assert.equal(resumed.mode, "continue");
  assert.equal(resumed.attempt, 2);
  assert.equal(resumed.results["fields.publisher"].value, "New publisher");
  assert.ok(
    calls.some(
      (c) =>
        c.method === "thread/delete" &&
        c.params.threadId === original.sessionId,
    ),
  );
});

test("failed session cleanup is visible and does not undo a stopped task", async function (t) {
  const config = fixture(t);
  const { manager } = runner(t, config, { deleteFailure: true });
  manager.start(1, "test", "high");
  await settle();
  await manager.stop(1);
  const task = manager.get(1);
  assert.equal(task.phase, "stopped");
  assert.equal(task.desired, "stopped");
  assert.equal(task.cleanupSessions.length, 1);
  assert.match(task.cleanupError, /cleanup failure/);
});

test("stop during session creation prevents a late creation response from starting work", async function (t) {
  let resolve;
  const creation = new Promise((done) => {
    resolve = done;
  });
  const config = fixture(t);
  const { manager, calls } = runner(t, config, { creation });
  manager.start(1, "test", "high");
  await settle();
  const stopping = manager.stop(1);
  resolve();
  await stopping;
  await settle();
  assert.equal(manager.get(1).desired, "stopped");
  assert.equal(calls.filter((c) => c.method === "turn/start").length, 0);
  assert.ok(calls.some((c) => c.method === "thread/delete"));
});

test("stopping during retry clears the old session and permits a later explicit resume", async function (t) {
  const config = fixture(t);
  const { manager, clients, calls } = runner(t, config);
  manager.start(1, "test", "high");
  await settle();
  const session = manager.get(1).sessionId;
  clients[0].events.onDisconnect(Error("Temporary connection failure"));
  await settle();
  assert.equal(manager.get(1).phase, "retrying");
  await manager.stop(1);
  assert.equal(manager.get(1).sessionId, null);
  assert.equal(manager.get(1).phase, "stopped");
  assert.ok(
    calls.some(
      (c) => c.method === "thread/delete" && c.params.threadId === session,
    ),
  );
  manager.start(1, "test", "high");
  await settle();
  assert.equal(manager.get(1).mode, "continue");
  assert.equal(manager.get(1).phase, "running");
});
