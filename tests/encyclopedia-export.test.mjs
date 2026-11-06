import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import yauzl from "yauzl";
import { exportDatabase } from "../src/server/encyclopedia/export-database.ts";
import { createCompletedArchive } from "../src/server/encyclopedia/export-archive.ts";
import { exportRequest } from "../src/server/encyclopedia/export-http.ts";

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "encyclopedia-export-test-"));
  const config = { workspace: root, dataRoot: path.join(root, "data"), database: path.join(root, "data/encyclopedia-workspace/encyclopedia.db") };
  fs.mkdirSync(path.dirname(config.database), { recursive: true });
  const db = new DatabaseSync(config.database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE encyclopedia_workspace(version INTEGER);
    INSERT INTO encyclopedia_workspace VALUES(1);
    CREATE TABLE entities(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,deleted_at TEXT);
    INSERT INTO entities VALUES(1,'已完成',NULL),(2,'完成部分',NULL),(3,'进行中',NULL),(4,'已删除','today'),(5,'已完成二',NULL);
    CREATE TABLE wiki_entry_types(key TEXT PRIMARY KEY,name TEXT);
    INSERT INTO wiki_entry_types VALUES('book','书籍'),('person','人物');
    CREATE TABLE wiki_entry_profiles(entity_id INTEGER PRIMARY KEY REFERENCES entities(id),type_key TEXT REFERENCES wiki_entry_types(key),fields TEXT);
    INSERT INTO wiki_entry_profiles SELECT id,'book','{"publisher": "原值"}' FROM entities;
    CREATE TABLE wiki_type_book(entity_id INTEGER PRIMARY KEY REFERENCES entities(id),publisher TEXT);
    INSERT INTO wiki_type_book SELECT id,'原值' FROM entities;
    CREATE TABLE wiki_evidence_sources(id INTEGER PRIMARY KEY,snapshot TEXT);
    INSERT INTO wiki_evidence_sources VALUES(11,'共享来源'),(12,'未完成专属来源');
    CREATE TABLE wiki_entry_evidence(entity_id INTEGER REFERENCES entities(id),source_id INTEGER REFERENCES wiki_evidence_sources(id));
    INSERT INTO wiki_entry_evidence VALUES(1,11),(2,11),(2,12);
    CREATE TABLE wiki_entity_relations(subject_id INTEGER REFERENCES entities(id),object_id INTEGER REFERENCES entities(id),source_id INTEGER REFERENCES wiki_evidence_sources(id));
    INSERT INTO wiki_entity_relations VALUES(1,2,11),(1,5,11);
    CREATE TABLE wiki_original_documents(path TEXT PRIMARY KEY,blob_path TEXT,sha256 TEXT,size INTEGER);
    CREATE TABLE wiki_entry_files(entity_id INTEGER REFERENCES entities(id),document_path TEXT REFERENCES wiki_original_documents(path));
    CREATE TABLE wiki_media_assets(sha256 TEXT PRIMARY KEY,relative_path TEXT,size_bytes INTEGER,bytes BLOB);
    CREATE TABLE wiki_entry_media(entity_id INTEGER REFERENCES entities(id),sha256 TEXT REFERENCES wiki_media_assets(sha256),source_id INTEGER REFERENCES wiki_evidence_sources(id));
    CREATE TABLE wiki_catalog_sources(id INTEGER PRIMARY KEY,entity_id INTEGER REFERENCES entities(id));
    INSERT INTO wiki_catalog_sources VALUES(21,1),(22,2);
    CREATE TABLE wiki_catalog_source_versions(id INTEGER PRIMARY KEY,source_id INTEGER REFERENCES wiki_catalog_sources(id));
    INSERT INTO wiki_catalog_source_versions VALUES(31,21),(32,22);
    CREATE TABLE wiki_expansion_candidates(id INTEGER PRIMARY KEY,entity_id INTEGER REFERENCES entities(id));
    INSERT INTO wiki_expansion_candidates VALUES(41,NULL),(42,2);
    CREATE TABLE wiki_candidate_occurrences(entity_id INTEGER REFERENCES entities(id),candidate_id INTEGER REFERENCES wiki_expansion_candidates(id));
    INSERT INTO wiki_candidate_occurrences VALUES(1,41),(1,42);
    CREATE TABLE wiki_candidate_nodes(source TEXT,node_id TEXT);
    INSERT INTO wiki_candidate_nodes VALUES('导入','未绑定候选');
    CREATE VIRTUAL TABLE wiki_fields_fts USING fts5(entity_id UNINDEXED,name,fields);
    INSERT INTO wiki_fields_fts(rowid,entity_id,name,fields) SELECT id+100,id,name,'原值' FROM entities;
    CREATE TABLE wiki_search_fts_rows(row_id INTEGER PRIMARY KEY,entity_id INTEGER);
    INSERT INTO wiki_search_fts_rows SELECT rowid,entity_id FROM wiki_fields_fts;
    CREATE INDEX evidence_entity ON wiki_entry_evidence(entity_id);
    CREATE VIEW entry_names AS SELECT id,name FROM entities;
    CREATE TRIGGER change_name AFTER UPDATE OF name ON entities BEGIN UPDATE wiki_fields_fts SET name=NEW.name WHERE entity_id=NEW.id; END;
    PRAGMA user_version=7;
  `);
  const document = Buffer.from("关联原件：PDF 的测试内容");
  const compressed = gzipSync(document);
  const documentPath = "encyclopedia-sources/text-blobs/original.txt.gz";
  fs.mkdirSync(path.dirname(path.join(config.dataRoot, documentPath)), { recursive: true });
  fs.writeFileSync(path.join(config.dataRoot, documentPath), compressed);
  db.prepare("INSERT INTO wiki_original_documents VALUES(?,?,?,?)").run("原件.pdf", documentPath.replaceAll("/", "\\"), hash(document), document.length);
  db.prepare("INSERT INTO wiki_original_documents VALUES(?,?,?,?)").run("不应导出.pdf", "missing.pdf", hash(document), document.length);
  db.exec("INSERT INTO wiki_entry_files VALUES(1,'原件.pdf'),(5,'原件.pdf'),(2,'不应导出.pdf')");
  const image = Buffer.from("external image");
  const mediaPath = "wiki/ab/image.png";
  const mediaFile = path.join(path.dirname(config.database), "assets", mediaPath);
  fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
  fs.writeFileSync(mediaFile, image);
  db.prepare("INSERT INTO wiki_media_assets VALUES(?,?,?,?)").run(hash(image), mediaPath, image.length, Buffer.alloc(0));
  db.prepare("INSERT INTO wiki_entry_media VALUES(1,?,11)").run(hash(image));
  const embedded = Buffer.from("embedded image");
  db.prepare("INSERT INTO wiki_media_assets VALUES(?,NULL,NULL,?)").run(hash(embedded), embedded);
  db.prepare("INSERT INTO wiki_entry_media VALUES(5,?,11)").run(hash(embedded));
  t.after(function cleanup() { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  function states() { return new Map([[1,"completed"],[2,"stopped"],[3,"running"],[4,"completed"],[5,"completed"]]); }
  return { root, config, db, states, documentPath, compressed, mediaFile, image, mediaPath };
}

function schema(db) {
  return db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
}

async function unzip(bytes) {
  const zip = await new Promise(function open(resolve,reject) {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, function ready(error, zip) { if(error) reject(error); else resolve(zip); });
  });
  const entries = new Map();
  await new Promise(function read(resolve,reject) {
    zip.on("error",reject);
    zip.on("end",resolve);
    zip.on("entry",function entry(item) {
      zip.openReadStream(item,function opened(error,stream) {
        if(error) { reject(error); return; }
        const chunks=[];
        stream.on("error",reject);
        stream.on("data",function chunk(bytes) { chunks.push(bytes); });
        stream.on("end",function end() { entries.set(item.fileName,Buffer.concat(chunks)); zip.readEntry(); });
      });
    });
    zip.readEntry();
  });
  return entries;
}

test("export preserves schema, IDs, shared dictionaries, related rows and FTS row IDs without changing the source", async function(t) {
  const f=fixture(t);
  const target=path.join(f.root,"subset.db");
  const ids=await exportDatabase(f.config,target,f.states,new AbortController().signal);
  assert.deepEqual(ids,[1,5]);
  const db=new DatabaseSync(target);
  try {
    assert.deepEqual(schema(db),schema(f.db));
    assert.deepEqual(db.prepare("SELECT id FROM entities ORDER BY id").all().map(function id(row) { return row.id; }),[1,5]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_entry_types").get().n,2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_entity_relations").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_evidence_sources").get().n,1);
    assert.equal(db.prepare("SELECT id FROM wiki_catalog_source_versions").get().id,31);
    assert.equal(db.prepare("SELECT id FROM wiki_expansion_candidates").get().id,41);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM wiki_candidate_nodes").get().n,0);
    assert.equal(db.prepare("SELECT rowid FROM wiki_fields_fts WHERE entity_id=1").get().rowid,101);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version,7);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    db.exec("UPDATE entities SET name='changed' WHERE id=1");
    assert.equal(db.prepare("SELECT name FROM wiki_fields_fts WHERE entity_id=1").get().name,"changed");
    assert.equal(f.db.prepare("SELECT name FROM entities WHERE id=1").get().name,"已完成");
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM entities").get().n,5);
  } finally {db.close();}
});

test("export uses a consistent database and completion snapshot while live data changes", async function(t) {
  const f=fixture(t);
  const states=f.states();
  function readStates() {
    setImmediate(function changeLiveData() {
      f.db.exec("UPDATE entities SET name='new live value' WHERE id=1");
      states.set(2,"completed");
    });
    return states;
  }
  const target=path.join(f.root,"snapshot.db");
  assert.deepEqual(await exportDatabase(f.config,target,readStates,new AbortController().signal),[1,5]);
  const db=new DatabaseSync(target);
  try { assert.equal(db.prepare("SELECT name FROM entities WHERE id=1").get().name,"已完成"); }
  finally {db.close();}
  assert.equal(f.db.prepare("SELECT name FROM entities WHERE id=1").get().name,"new live value");
});

test("ZIP contains a working subset database, deduplicated original files and external images at their existing relative paths", async function(t) {
  const f=fixture(t);
  const archive=await createCompletedArchive(f.config,f.states,new AbortController().signal);
  try {
    const entries=await unzip(fs.readFileSync(archive.file));
    const manifest=JSON.parse(entries.get("manifest.json"));
    assert.deepEqual(manifest.entryIds,[1,5]);
    assert.equal(manifest.entryCount,2);
    assert.deepEqual(entries.get("data/"+f.documentPath),f.compressed);
    assert.deepEqual(entries.get("data/encyclopedia-workspace/assets/"+f.mediaPath),f.image);
    const database=path.join(f.root,"unzipped.db");
    fs.writeFileSync(database,entries.get(manifest.database));
    const db=new DatabaseSync(database);
    try { assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok"); }
    finally {db.close();}
    assert.equal(entries.size,5);
  } finally {await archive.cleanup();}
  assert.equal(fs.existsSync(archive.file),false);
});

test("empty selection, missing or corrupt attachments, path traversal and cancellation fail without returning incomplete ZIPs", async function(t) {
  const f=fixture(t);
  const signal=new AbortController().signal;
  function tempExports() {return fs.readdirSync(os.tmpdir()).filter(function name(value) {return value.startsWith("encyclopedia-export-")&&!value.startsWith("encyclopedia-export-test-");}).sort();}
  const before=tempExports();
  await assert.rejects(createCompletedArchive(f.config,function none() {return new Map();},signal),/没有可导出/);
  fs.writeFileSync(f.mediaFile,"corrupted");
  await assert.rejects(createCompletedArchive(f.config,f.states,signal),/校验失败/);
  fs.unlinkSync(f.mediaFile);
  await assert.rejects(createCompletedArchive(f.config,f.states,signal),/无法完整打包附件/);
  f.db.exec("UPDATE wiki_original_documents SET blob_path='../outside.pdf' WHERE path='原件.pdf'");
  await assert.rejects(createCompletedArchive(f.config,f.states,signal),/路径/);
  const controller=new AbortController();
  function abortingStates() {setImmediate(function abort() {controller.abort();});return f.states();}
  await assert.rejects(createCompletedArchive(f.config,abortingStates,controller.signal),{name:"AbortError"});
  assert.deepEqual(tempExports(),before);
});

test("HTTP prepares an archive then streams a single-use download and cleans up after transfer", async function(t) {
  const f=fixture(t);
  const pending=exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  const duplicate=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  assert.equal(duplicate.status,409);
  const response=await pending;
  const result=await response.json();
  const token=result.url.split("/").at(-1);
  const record=globalThis.encyclopediaExports.downloads.get(token);
  const request=new Request("http://localhost"+result.url);
  const download=await exportRequest(request,["export",token],f.config,f.states);
  assert.equal(download.headers.get("Content-Type"),"application/zip");
  assert.match(download.headers.get("Content-Disposition"),/attachment/);
  const bytes=Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length,Number(download.headers.get("Content-Length")));
  assert.equal((await unzip(bytes)).has("manifest.json"),true);
  assert.equal((await exportRequest(request,["export",token],f.config,f.states)).status,404);
  for(let attempt=0;attempt<30&&fs.existsSync(record.archive.file);attempt++)await delay(20);
  assert.equal(fs.existsSync(record.archive.file),false);
});

test("actual local database schema can be exported with foreign keys and all schema objects preserved", async function(t) {
  const database="C:/Users/laplace/Desktop/FusionNexus/portal/data/encyclopedia-workspace/encyclopedia.db";
  if(!fs.existsSync(database)){t.skip("Local encyclopedia database not installed");return;}
  const f=fixture(t);
  const target=path.join(f.root,"real-schema.db");
  const source=new DatabaseSync(database,{readOnly:true});
  try {
    const row=source.prepare("SELECT e.id FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id WHERE e.deleted_at IS NULL ORDER BY e.id LIMIT 1").get();
    await exportDatabase({...f.config,database},target,function states(){return new Map([[row.id,"completed"]]);},new AbortController().signal);
    const db=new DatabaseSync(target);
    try {
      const businessSchema = schema(source).filter(function businessObject(row) { return !row.name.startsWith("panel_view_"); });
      assert.deepEqual(schema(db),businessSchema);
      assert.equal(schema(db).some(function internalObject(row) { return row.name.startsWith("panel_view_"); }), false);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM entities").get().n,1);
    } finally {db.close();}
  } finally {source.close();}
});

test("cancelling ZIP compression releases open files and removes the entire staging directory", async function(t) {
  const f=fixture(t);
  const image=randomBytes(4*1024*1024);
  fs.writeFileSync(f.mediaFile,image);
  f.db.exec("BEGIN; PRAGMA defer_foreign_keys=ON");
  f.db.prepare("UPDATE wiki_media_assets SET sha256=?,size_bytes=? WHERE relative_path IS NOT NULL").run(hash(image),image.length);
  f.db.prepare("UPDATE wiki_entry_media SET sha256=? WHERE entity_id=1").run(hash(image));
  f.db.exec("COMMIT");
  const initial=new Set(fs.readdirSync(os.tmpdir()));
  const controller=new AbortController();
  let staging;
  const timer=setInterval(function cancelWhenCompressing() {
    for(const name of fs.readdirSync(os.tmpdir())) {
      if(initial.has(name)||!name.startsWith("encyclopedia-export-"))continue;
      const directory=path.join(os.tmpdir(),name);
      if(fs.existsSync(path.join(directory,"completed.zip"))) { staging=directory; controller.abort(); }
    }
  },2);
  try {await assert.rejects(createCompletedArchive(f.config,f.states,controller.signal),{name:"AbortError"});}
  finally {clearInterval(timer);}
  assert.ok(staging);
  assert.equal(fs.existsSync(staging),false);
});

test("cancelling a download removes its token and temporary files", async function(t) {
  const f=fixture(t);
  const prepared=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  const result=await prepared.json();
  const token=result.url.split("/").at(-1);
  const record=globalThis.encyclopediaExports.downloads.get(token);
  const download=await exportRequest(new Request("http://localhost"+result.url),["export",token],f.config,f.states);
  await download.body.cancel();
  for(let attempt=0;attempt<30&&fs.existsSync(record.archive.file);attempt++)await delay(20);
  assert.equal(globalThis.encyclopediaExports.downloads.has(token),false);
  assert.equal(fs.existsSync(record.archive.file),false);
});
