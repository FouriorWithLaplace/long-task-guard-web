import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ViewBuilder } from "../src/server/encyclopedia/view-builder.ts";
import { PageViews, viewsDirectory, entryBucket } from "../src/server/encyclopedia/page-views.ts";
import { TaskStore } from "../src/server/encyclopedia/store.ts";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-views-"));
  const config = { workspace: root, database: path.join(root, "source.sqlite"), dataRoot: root, cleanup: [] };
  t.after(function cleanup() {
    for (const close of config.cleanup) close();
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("page-views-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const db = new DatabaseSync(config.database);
  db.exec(`
    CREATE TABLE encyclopedia_workspace(id INTEGER);
    CREATE TABLE entities(id INTEGER PRIMARY KEY,name TEXT,name_en TEXT,deleted_at TEXT);
    CREATE TABLE wiki_entry_types(key TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE wiki_entry_profiles(entity_id INTEGER PRIMARY KEY,type_key TEXT,state TEXT,version INTEGER);
    CREATE TABLE wiki_column_fields(type_key TEXT,column_name TEXT,field_key TEXT,storage TEXT,collection_mode TEXT,ordinal INTEGER);
    CREATE TABLE wiki_column_value_types(entity_id INTEGER,column_name TEXT,json_type TEXT);
    CREATE TABLE wiki_type_book(entity_id INTEGER PRIMARY KEY,title TEXT,notes TEXT);
    INSERT INTO wiki_entry_types VALUES('book','Books');
    INSERT INTO wiki_column_fields VALUES('book','title','title','fields',NULL,0),('book','notes','notes','fields',NULL,1);
  `);
  db.exec("BEGIN");
  for (let id = 1; id <= 260; id++) {
    db.prepare("INSERT INTO entities VALUES(?,?,?,NULL)").run(id, "Book " + id, "title_" + id);
    db.prepare("INSERT INTO wiki_entry_profiles VALUES(?,'book','pending',1)").run(id);
    db.prepare("INSERT INTO wiki_type_book VALUES(?,?,NULL)").run(id, "Title " + id);
  }
  db.exec("COMMIT");
  db.close();
  return config;
}
function task(id) {
  return {
    entityId: id, name: "Book " + id, type: "book", phase: "completed", desired: "stopped",
    mode: "continue", processedFields: ["fields.title"], filled: 1, slotHeld: false, queuedAt: "2026-01-01",
    runId: "test", generation: 1, attempt: 1, failures: 0, noProgress: 0, sessionId: null,
    cleanupSessions: [], cleanupError: "", model: "test", reasoning: "high", scope: ["fields.title", "fields.notes"],
    dictionaryHash: "test", skillHash: "test", startedAt: "2026-01-01", updatedAt: "2026-01-01",
    nextRetryAt: null, message: "Done", unconfirmed: 0,
    results: { "fields.title": { field: "fields.title", readback: true, outcome: "verified", value: "Title " + id,
      changed: false, evidence: [{ snapshot: "sensitive-evidence".repeat(10000) }], candidates: [], reason: "", nextCondition: "" } },
  };
}

test('program fields stay outside progress and database writes realign research confirmations', function(t) {
  const config=fixture(t);
  const db=new DatabaseSync(config.database);
  db.exec("ALTER TABLE wiki_type_book ADD COLUMN score REAL; INSERT INTO wiki_column_fields VALUES('book','score','score','fields','system',2)");
  const store=new TaskStore(config);
  const current=task(1);
  current.phase='stopped';
  current.scope.push('fields.score');
  current.computedFields={'fields.score':false};
  current.processedFields=['fields.title','fields.notes'];
  current.results['fields.title'].value='Title 1';
  current.results['fields.notes']={...current.results['fields.title'],field:'fields.notes',value:null,outcome:'not_applicable'};
  current.cleanupSessions=['old-session-awaiting-deletion'];
  store.save(current);
  const builder=new ViewBuilder(config);
  config.cleanup.push(function close(){builder.close();store.close();db.close();});
  builder.sync();
  const views=new PageViews(config);
  assert.deepEqual(views.entry(1).progress,{filled:1,checked:2,total:2,percent:100});
  assert.deepEqual(views.entries('book','',1,'completed',true).ids,[1]);
  assert.equal(store.get(1).phase,'completed');
  assert.equal(store.get(1).desired,'stopped');
  assert.deepEqual(store.get(1).scope,['fields.title','fields.notes']);
  assert.equal(store.get(1).results['fields.notes'].outcome,'not_applicable');
  assert.deepEqual(store.get(1).cleanupSessions,['old-session-awaiting-deletion']);
  const external=new DatabaseSync(path.join(config.workspace,'panel/state.sqlite'));
  external.exec("UPDATE tasks SET body=json_set(body,'$.phase','completed') WHERE entity_id=1");
  external.close();
  builder.sync();
  assert.equal(store.get(1).phase,'completed','a task-file update must be checked against current database fields');
  db.exec('UPDATE wiki_type_book SET score=0 WHERE entity_id=1');
  builder.sync();
  assert.equal(views.entry(1).progress.percent,100);
  assert.equal(store.get(1).computedFields['fields.score'],undefined);
  assert.equal(store.get(1).phase,'completed');
  assert.deepEqual(views.entries('book','',1,'completed',true).ids,[1]);
  db.exec("UPDATE wiki_type_book SET title='Externally changed',score=NULL WHERE entity_id=1");
  builder.sync();
  assert.equal(store.get(1).phase,'stopped');
  assert.deepEqual(store.get(1).processedFields,['fields.notes']);
  assert.deepEqual(views.entry(1).progress,{filled:1,checked:1,total:2,percent:50});
  builder.sync();
  assert.equal(builder.sync().changed,0);
});

test("concurrency settings update projections even with no task or source changes", function(t) {
  const config = fixture(t);
  const builder = new ViewBuilder(config);
  config.cleanup.push(function close() { builder.close(); });
  builder.sync();
  const views = new PageViews(config);
  assert.equal(views.home().concurrency, 2);
  const revision = views.manifest().revision;
  const store = new TaskStore(config);
  store.setConcurrency(8);
  store.close();
  assert.equal(builder.sync().changed, 0);
  assert.notEqual(views.manifest().revision, revision);
  assert.equal(views.home().concurrency, 8);
  assert.equal(views.tasks(false).concurrency, 8);
  assert.equal(views.tasks(false, 1, true).concurrency, 8);
});

test("overview, paging and select-all use files even with both databases unavailable", function(t) {
  const config = fixture(t);
  const store = new TaskStore(config);
  store.save(task(1)); store.close();
  const builder = new ViewBuilder(config);
  assert.equal(builder.sync().changed, 260);
  builder.close();
  fs.renameSync(config.database, config.database + ".offline");
  fs.renameSync(path.join(config.workspace, "panel/state.sqlite"), path.join(config.workspace, "panel/state.offline"));
  const views = new PageViews(config);
  assert.equal(views.home().categories[0].total, 260);
  assert.equal(views.entries("book", "", 2).entries[0].id, 31);
  assert.equal(views.entries("book", "", 1, "all", true).ids.length, 260);
  assert.deepEqual(views.entries("book", "", 1, "completed", true).ids, []);
  assert.deepEqual(views.entries("book", "", 1, "partial", true).ids, [1]);
  assert.equal(views.entries("book", "", 1, "never", true).total, 259);
  assert.equal(views.entries("book", "TITLE_1", 1, "all", true).total, 111);
  assert.equal(views.entries("book", "%", 1, "all", true).total, 0);
  assert.deepEqual(views.entry(1).progress, { filled: 1, checked: 1, total: 2, percent: 50 });
  assert.equal(JSON.stringify(views.entry(1)).includes("sensitive-evidence"), false);
  assert.ok(JSON.stringify(views.entries("book")).length < 30000);
  assert.equal(views.tasks(true).totalTasks, 1);
});

test("task select-all crosses pages, respects history and reads only the task index", function(t) {
  const config = fixture(t);
  const store = new TaskStore(config);
  for (let id = 1; id <= 65; id++) {
    const current = task(id);
    if (id <= 61) {
      current.phase = "queued";
      current.desired = "running";
    }
    store.save(current);
  }
  store.close();
  const builder = new ViewBuilder(config);
  builder.sync();
  builder.close();
  const views = new PageViews(config);
  assert.equal(views.tasks(false, 1).tasks.length, 30);
  assert.equal(views.tasks(false, 3).tasks.length, 1);
  t.mock.method(views, "entry", function rejectDetailRead() {
    throw new Error("Selecting IDs must not load task details");
  });
  const active = views.tasks(false, 2, true);
  assert.equal(active.ids.length, 61);
  assert.equal(active.total, 61);
  assert.equal(active.pages, 3);
  assert.deepEqual(active.tasks, []);
  assert.ok(active.ids.every(function running(id) { return id <= 61; }));
  const history = views.tasks(true, 1, true);
  assert.equal(history.ids.length, 65);
  assert.equal(new Set(history.ids).size, 65);
  fs.writeFileSync(path.join(viewsDirectory(config), "task-index.json"), "[]");
  assert.deepEqual(views.tasks(false, 1, true).ids, []);
  assert.equal(views.tasks(false, 1, true).total, 0);
});

test("task categories filter before paging and select-all, including scientific subtypes", function(t) {
  const config = fixture(t);
  const db = new DatabaseSync(config.database);
  for (const type of ["paper", "concept", "material", "device"]) {
    db.prepare("INSERT INTO wiki_entry_types VALUES(?,?)").run(type, type);
    db.exec("CREATE TABLE wiki_type_" + type + "(entity_id INTEGER PRIMARY KEY,title TEXT,notes TEXT)");
    db.prepare("INSERT INTO wiki_column_fields SELECT ?,column_name,field_key,storage,collection_mode,ordinal FROM wiki_column_fields WHERE type_key='book'").run(type);
  }
  const store = new TaskStore(config);
  for (let id = 1; id <= 93; id++) {
    let type = id % 2 ? "book" : "paper";
    if (id === 91) type = "concept";
    if (id === 92) type = "material";
    if (id === 93) type = "device";
    db.prepare("UPDATE wiki_entry_profiles SET type_key=? WHERE entity_id=?").run(type, id);
    if (type !== "book") db.prepare("INSERT INTO wiki_type_" + type + " VALUES(?,?,NULL)").run(id, type + id);
    const current = task(id);
    current.type = type;
    if (id <= 80 || id === 91 || id === 92) {
      current.phase = "queued";
      current.desired = "running";
    }
    store.save(current);
  }
  store.close();
  db.close();
  const builder = new ViewBuilder(config);
  builder.sync();
  builder.close();
  // 筛选仅依赖页面索引，数据库离线时仍然可用。
  fs.renameSync(config.database, config.database + ".offline");
  const views = new PageViews(config);
  const books = views.tasks(false, 2, false, "book");
  assert.equal(books.tasks.length, 10);
  assert.equal(books.total, 40);
  assert.equal(books.filteredActiveCount, 40);
  assert.equal(books.totalTasks, 45);
  assert.equal(books.pages, 2);
  assert.ok(books.tasks.every(function book(item) { return item.type === "book"; }));
  const history = views.tasks(true, 1, false, "book");
  assert.equal(history.total, 45);
  assert.equal(history.filteredActiveCount, 40);
  assert.equal(views.tasks(false, 99, false, "book").page, 2);
  t.mock.method(views, "entry", function noDetails() { throw new Error("Selection must not load details"); });
  const selected = views.tasks(false, 1, true, "book").ids;
  assert.equal(selected.length, 40);
  assert.ok(selected.every(function book(id) { return id <= 80 && id % 2 === 1; }));
  assert.equal(views.tasks(true, 1, true, "paper").ids.length, 45);
  assert.deepEqual(views.tasks(false, 1, true, "entry").ids.sort(), [91, 92]);
  assert.deepEqual(views.tasks(false, 1, true, "device").ids, []);
  assert.deepEqual(views.tasks(true, 1, true, "device").ids, [93]);
  assert.deepEqual(views.tasks(true, 1, true, "journal").ids, []);
  assert.equal(views.tasks(false, 1, true, "all").ids.length, 82);
  assert.equal(views.tasks(true, 1, true).ids.length, 93);
  assert.throws(function unknownCategory() { views.tasks(false, 1, true, "invalid"); }, /不存在的分类/);
});

test("name and completion sorts run before pagination and preserve default order", function(t) {
  const config = fixture(t);
  const db = new DatabaseSync(config.database);
  for (const [id, name] of [[1, "测试中山"], [2, "测试北京"], [3, "测试安徽"], [4, "English Beta"], [5, "English Alpha"]]) {
    db.prepare("UPDATE entities SET name=? WHERE id=?").run(name, id);
  }
  db.close();
  const store = new TaskStore(config);
  for (const id of [1, 2, 3, ...Array.from({ length: 35 }, function id(_, index) { return index + 101; })]) {
    const current = task(id);
    current.phase = "queued";
    current.desired = "running";
    if (id >= 101) {
      current.processedFields.push("fields.notes");
      current.results["fields.notes"] = { ...current.results["fields.title"], field: "fields.notes" };
    }
    store.save(current);
  }
  const builder = new ViewBuilder(config);
  config.cleanup.push(function close() { builder.close(); store.close(); });
  builder.sync();
  const views = new PageViews(config);
  assert.deepEqual(views.entries("book", "测试", 1, "all", true, "name").ids, [3, 2, 1]);
  assert.deepEqual(views.entries("book", "English", 1, "all", true, "name").ids, [5, 4]);
  assert.equal(views.entries("book", "", 1, "all", false, "progress").entries[0].id, 101);
  assert.equal(views.entries("book", "", 2, "all", false, "progress").entries[0].id, 131);
  assert.equal(views.entries("book", "", 1).entries[0].id, 1);
  assert.equal(views.tasks(false, 1, false, "book", "progress").tasks[0].entityId, 101);
  assert.equal(views.tasks(true, 2, false, "all", "progress").tasks[0].entityId, 131);
  assert.deepEqual(views.tasks(true, 1, true, "book", "name").ids.slice(0, 3), [3, 2, 1]);
  assert.equal(views.tasks(true).tasks[0].entityId, 1);
  // 只改变进度、状态分组不变时也必须更新索引并使排序缓存失效。
  const changed = store.get(3);
  changed.processedFields.push("fields.notes");
  changed.results["fields.notes"] = { ...changed.results["fields.title"], field: "fields.notes" };
  store.save(changed);
  builder.sync();
  assert.equal(views.entries("book", "", 1, "all", false, "progress").entries[0].id, 3);
  t.mock.method(views, "entry", function noDetails() { throw new Error("Sort selection must use indexes"); });
  const selected = views.entries("book", "", 1, "running", true, "progress").ids;
  assert.equal(selected.length, 38);
  assert.equal(selected[0], 3);
  assert.deepEqual(views.tasks(false, 1, true, "book", "progress").ids, selected);
  assert.throws(function invalid() { views.tasks(false, 1, false, "all", "bad"); }, /排序方式/);
  assert.throws(function invalid() { views.entries("book", "", 1, "all", false, "bad"); }, /排序方式/);
});

test("execution order matches occupied slots and the global queue across filters and pages", function(t) {
  const config = fixture(t);
  const db = new DatabaseSync(config.database);
  db.exec(`INSERT INTO wiki_entry_types VALUES('paper','Papers');
    CREATE TABLE wiki_type_paper(entity_id INTEGER PRIMARY KEY,title TEXT,notes TEXT);
    INSERT INTO wiki_type_paper VALUES(64,'Paper',NULL);
    UPDATE wiki_entry_profiles SET type_key='paper' WHERE entity_id=64;
    INSERT INTO wiki_column_fields SELECT 'paper',column_name,field_key,storage,collection_mode,ordinal FROM wiki_column_fields WHERE type_key='book';`);
  db.close();
  const store = new TaskStore(config);
  for (let id = 1; id <= 66; id++) {
    const current = task(id);
    current.phase = "queued";
    current.desired = "running";
    current.queueOrder = 100 - id;
    if (id === 1) { current.phase = "completed"; current.desired = "stopped"; }
    if (id === 2 || id === 66) {
      current.phase = "retrying";
      current.nextRetryAt = new Date(Date.now() + 60000).toISOString();
    }
    if (id === 3) { current.phase = "stopping"; current.desired = "stopped"; }
    if (id === 64) current.type = "paper";
    if (id >= 65) { current.slotHeld = true; current.queueOrder = id; }
    if (id === 65) current.phase = "running";
    store.save(current);
  }
  const builder = new ViewBuilder(config);
  config.cleanup.push(function close() { builder.close(); store.close(); });
  builder.sync();
  const views = new PageViews(config);
  const first = views.tasks(false, 1, false, "all", "execution");
  assert.deepEqual(first.tasks.slice(0, 4).map(function id(item) { return item.entityId; }), [65, 66, 64, 63]);
  assert.deepEqual(first.tasks[0].displayQueue, { state: "active", position: null });
  assert.deepEqual(first.tasks[1].displayQueue, { state: "active", position: null });
  assert.deepEqual(first.tasks[2].displayQueue, { state: "waiting", position: 1 });
  const second = views.tasks(false, 2, false, "all", "execution");
  assert.equal(second.tasks[0].entityId, 36);
  assert.equal(second.tasks[0].displayQueue.position, 29);
  const books = views.tasks(false, 1, false, "book", "execution");
  assert.equal(books.tasks[2].entityId, 63);
  assert.equal(books.tasks[2].displayQueue.position, 2); // 第 1 位是另一个分类的任务。
  const last = views.tasks(true, 3, false, "all", "execution").tasks;
  assert.deepEqual(last.slice(-3).map(function id(item) { return item.entityId; }), [2, 3, 1]);
  assert.deepEqual(last.slice(-3).map(function state(item) { return item.displayQueue.state; }), ["delayed", "stopping", "inactive"]);
  assert.equal(views.tasks(false).tasks[0].entityId, 2);
  assert.equal(views.entry(63).task.displayQueue, undefined);
  assert.throws(function categoryOnly() { views.entries("book", "", 1, "all", false, "execution"); }, /排序方式/);
  const noDetails = t.mock.method(views, "entry", function forbidden() { throw new Error("Index-only selection"); });
  const ids = views.tasks(false, 1, true, "all", "execution").ids;
  assert.deepEqual(ids.slice(0, 4), [65, 66, 64, 63]);
  noDetails.mock.restore();
  // 任务释放名额后，序号由实时快照重新计算。
  const stopped = store.get(64);
  stopped.phase = "stopped";
  stopped.desired = "stopped";
  store.save(stopped);
  builder.sync();
  assert.equal(views.tasks(false, 1, false, "book", "execution").tasks[2].displayQueue.position, 1);
  const oldIndex = views.read("task-index.json").map(function legacy(item) { return { id: item.id, active: item.active }; });
  fs.writeFileSync(path.join(viewsDirectory(config), "task-index.json"), JSON.stringify(oldIndex));
  assert.deepEqual(views.tasks(false, 1, true, "all", "execution").ids.slice(0, 3), [65, 66, 63]);
});

test("old projection formats rebuild completion sort keys without changing default order", function(t) {
  const config = fixture(t);
  let builder = new ViewBuilder(config);
  builder.sync();
  builder.close();
  const views = new PageViews(config);
  const manifest = views.manifest();
  manifest.format = 4;
  fs.writeFileSync(path.join(viewsDirectory(config), "manifest.json"), JSON.stringify(manifest));
  const index = views.read("catalog/book.json");
  for (const item of index) delete item.completion;
  fs.writeFileSync(path.join(viewsDirectory(config), "catalog/book.json"), JSON.stringify(index));
  assert.equal(views.entries("book", "", 1, "all", true, "progress").ids.length, 260);
  builder = new ViewBuilder(config);
  assert.equal(builder.sync().rebuilt, true);
  builder.close();
  assert.equal(views.manifest().format, 5);
  assert.equal(views.read("catalog/book.json")[0].completion, 0);
  assert.equal(views.entries("book").entries[0].id, 1);
});

test("idle sync does not rewrite files; external changes update only affected shards and filters", function(t) {
  const config = fixture(t);
  const builder = new ViewBuilder(config);
  config.cleanup.push(function close() { builder.close(); });
  builder.sync();
  const views = new PageViews(config);
  const firstRevision = views.manifest().revision;
  const otherShard = path.join(viewsDirectory(config), entryBucket(256));
  const otherStamp = fs.statSync(otherShard).mtimeMs;
  assert.deepEqual(builder.sync(), { changed: 0, rebuilt: false });
  assert.equal(views.manifest().revision, firstRevision);
  const db = new DatabaseSync(config.database);
  db.exec("BEGIN; UPDATE wiki_type_book SET notes='external change' WHERE entity_id=1; UPDATE entities SET name='Renamed' WHERE id=1; COMMIT");
  db.close();
  assert.equal(builder.sync().changed, 1);
  assert.equal(views.entry(1).progress.filled, 2);
  assert.equal(views.entries("book", "Renamed").total, 1);
  assert.equal(fs.statSync(otherShard).mtimeMs, otherStamp);
  const store = new TaskStore(config);
  const current = task(1); current.desired = "running"; current.phase = "queued";
  store.save(current); store.close();
  builder.sync();
  assert.equal(views.home().activeCount, 1);
  assert.equal(views.entry(1).progress.filled, 2); // Task-only updates preserve actual database fill counts.
  assert.deepEqual(views.entries("book", "", 1, "running", true).ids, [1]);
  const external = new DatabaseSync(path.join(config.workspace, "panel/state.sqlite"));
  external.exec("UPDATE tasks SET body=json_set(body,'$.desired','stopped','$.phase','stopped') WHERE entity_id=1");
  external.close();
  builder.sync();
  assert.equal(views.home().activeCount, 0);
  assert.equal(views.entry(1).task.phase, "stopped");
});

test("rollback produces no changes; deletion and schema changes rebuild correct counts", function(t) {
  const config = fixture(t);
  const builder = new ViewBuilder(config);
  config.cleanup.push(function close() { builder.close(); });
  builder.sync();
  const db = new DatabaseSync(config.database);
  db.exec("BEGIN; UPDATE wiki_type_book SET notes='rolled back' WHERE entity_id=1; ROLLBACK");
  assert.equal(builder.sync().changed, 0);
  db.exec("DELETE FROM entities WHERE id=1");
  builder.sync();
  const views = new PageViews(config);
  assert.equal(views.home().categories[0].total, 259);
  assert.equal(views.entry(1), null);
  db.exec("UPDATE wiki_column_fields SET collection_mode='paused' WHERE column_name='notes'");
  assert.equal(builder.sync().rebuilt, true);
  assert.equal(views.entry(2).progress.total, 1);
  db.close();
});

test("a crash before manifest publication replays durable changes on restart", function(t) {
  const config = fixture(t);
  let builder = new ViewBuilder(config);
  builder.sync();
  const original = new PageViews(config).manifest().revision;
  const db = new DatabaseSync(config.database);
  db.exec("UPDATE wiki_type_book SET notes='committed' WHERE entity_id=2");
  db.close();
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, "renameSync", function failManifest(from, to) {
    if (String(to).endsWith("manifest.json")) throw new Error("simulated crash");
    return rename(from, to);
  });
  assert.throws(function sync() { builder.sync(); }, /simulated crash/);
  failure.mock.restore();
  builder.close();
  assert.equal(new PageViews(config).manifest().revision, original);
  builder = new ViewBuilder(config);
  assert.equal(builder.sync().changed, 1);
  builder.close();
  assert.equal(new PageViews(config).entry(2).progress.filled, 2);
});
