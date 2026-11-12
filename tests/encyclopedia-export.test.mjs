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
import { waitForArchive } from "../src/components/encyclopedia-export.ts";
import { encyclopediaGateway } from "../src/server/encyclopedia/gateway.ts";

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "encyclopedia-export-test-"));
  const config = { workspace: root, dataRoot: path.join(root, "data"), database: path.join(root, "data/encyclopedia-workspace/encyclopedia.db") };
  fs.mkdirSync(path.dirname(config.database), { recursive: true });
  const db = new DatabaseSync(config.database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE encyclopedia_workspace(version INTEGER);
    INSERT INTO encyclopedia_workspace VALUES(1);
    CREATE TABLE system_config(config_key TEXT PRIMARY KEY,config_value TEXT NOT NULL,description TEXT,updated_by INTEGER,updated_at TEXT DEFAULT (datetime('now')));
    INSERT INTO system_config(config_key,config_value,description) VALUES('wiki.editorial-stage','"collecting"','词条整理阶段');
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

async function readyExport(prepared, config, states) {
  assert.equal(prepared.status,202);
  const started=await prepared.json();
  const jobId=started.jobUrl.split("/").at(-1);
  for(let attempt=0;attempt<100;attempt++) {
    const response=await exportRequest(new Request("http://localhost"+started.jobUrl),["export","status",jobId],config,states);
    const job=await response.json();
    if(job.status==="ready")return job;
    if(job.status==="failed")throw new Error(job.error);
    assert.equal(job.status,"preparing");
    await delay(20);
  }
  throw new Error("导出任务没有在预期时间内完成。");
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
  const archive=await createCompletedArchive(f.config,f.states,new AbortController().signal,{includeOriginals:true});
  try {
    const entries=await unzip(fs.readFileSync(archive.file));
    const manifest=JSON.parse(entries.get("manifest.json"));
    assert.deepEqual(manifest.entryIds,[1,5]);
    assert.equal(manifest.entryCount,2);
    assert.equal(manifest.originalsIncluded,true);
    assert.equal(manifest.omittedOriginalCount,0);
    assert.deepEqual(entries.get("data/"+f.documentPath),f.compressed);
    assert.deepEqual(entries.get("data/encyclopedia-workspace/assets/"+f.mediaPath),f.image);
    const guide=entries.get("迁移指南.md").toString("utf8");
    assert.match(guide,/同结构/);
    assert.match(guide,/data\/encyclopedia-workspace\/encyclopedia\.db/);
    assert.match(guide,/备份/);
    assert.match(guide,/词条数量：2/);
    const database=path.join(f.root,"unzipped.db");
    fs.writeFileSync(database,entries.get(manifest.database));
    const db=new DatabaseSync(database);
    try {
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
      assert.equal(db.prepare("SELECT config_value FROM system_config WHERE config_key=?").get("encyclopedia.display-export.originals-omitted"),undefined);
    }
    finally {db.close();}
    assert.equal(entries.size,6);
  } finally {await archive.cleanup();}
  assert.equal(fs.existsSync(archive.file),false);
});

test("display archive keeps the database and external images, omits original files and records the limitation", async function(t) {
  const f=fixture(t);
  const key="encyclopedia.display-export.originals-omitted";
  // 即使原件不存在，默认导出也不应尝试读取它。
  fs.unlinkSync(path.join(f.config.dataRoot,f.documentPath));
  const archive=await createCompletedArchive(f.config,f.states,new AbortController().signal);
  try {
    assert.match(archive.filename,/^encyclopedia-display-/);
    assert.equal(archive.originalsIncluded,false);
    const entries=await unzip(fs.readFileSync(archive.file));
    const manifest=JSON.parse(entries.get("manifest.json"));
    assert.equal(manifest.originalsIncluded,false);
    assert.equal(manifest.omittedOriginalCount,1);
    const names=Array.from(entries.keys());
    assert.equal(names.some(function original(name){return name.startsWith("data/encyclopedia-sources/");}),false);
    assert.equal(entries.has("data/"+f.documentPath),false);
    assert.deepEqual(entries.get("data/encyclopedia-workspace/assets/"+f.mediaPath),f.image);
    assert.match(entries.get("README.txt").toString("utf8"),/不含原始资料/);
    const guide=entries.get("迁移指南.md").toString("utf8");
    assert.match(guide,/网页展示库/);
    assert.match(guide,/未包含/);
    assert.match(guide,/不能用于继续采集/);
    const database=path.join(f.root,"display.db");
    fs.writeFileSync(database,entries.get(manifest.database));
    const db=new DatabaseSync(database,{readOnly:true});
    try {
      assert.equal(db.prepare("SELECT config_value FROM system_config WHERE config_key=?").get(key).config_value,"true");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
    } finally {db.close();}
    assert.equal(f.db.prepare("SELECT config_value FROM system_config WHERE config_key=?").get(key),undefined);
    assert.equal(entries.size,5);
    await assert.rejects(
      createCompletedArchive({...f.config,database},f.states,new AbortController().signal,{includeOriginals:true}),
      /网页展示库/,
    );
  } finally {await archive.cleanup();}
});

test("HTTP defaults to a display archive without reading originals and rejects full exports", async function(t) {
  const f=fixture(t);
  const invalid=await exportRequest(new Request("http://localhost/api/encyclopedia/export?mode=other",{method:"POST"}),["export"],f.config,f.states);
  assert.equal(invalid.status,400);
  const full=await exportRequest(new Request("http://localhost/api/encyclopedia/export?mode=complete",{method:"POST"}),["export"],f.config,f.states);
  assert.equal(full.status,400);
  fs.unlinkSync(path.join(f.config.dataRoot,f.documentPath));
  const prepared=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  const result=await readyExport(prepared,f.config,f.states);
  assert.equal(result.count,2);
  assert.equal(result.originalsIncluded,false);
  assert.match(result.filename,/^encyclopedia-display-/);
  const token=result.url.split("/").at(-1);
  const record=globalThis.encyclopediaExports.downloads.get(token);
  const staging=path.dirname(record.archive.file);
  const download=await exportRequest(new Request("http://localhost"+result.url),["export",token],f.config,f.states);
  const bytes=Buffer.from(await download.arrayBuffer());
  const entries=await unzip(bytes);
  const manifest=JSON.parse(entries.get("manifest.json"));
  assert.equal(manifest.originalsIncluded,false);
  assert.equal(Array.from(entries.keys()).some(function original(name){return name.startsWith("data/encyclopedia-sources/");}),false);
  assert.equal(entries.has("data/encyclopedia-workspace/assets/"+f.mediaPath),true);
  await exportRequest(new Request("http://localhost"+result.url,{method:"DELETE"}),["export",token],f.config,f.states);
  for(let attempt=0;attempt<30&&fs.existsSync(staging);attempt++)await delay(20);
  assert.equal(fs.existsSync(staging),false);
});

test("background job reports preparation failures and releases the export slot", async function(t) {
  const f=fixture(t);
  function none() {return new Map();}
  const prepared=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,none);
  const started=await prepared.json();
  const jobId=started.jobUrl.split("/").at(-1);
  let job;
  for(let attempt=0;attempt<100;attempt++) {
    const response=await exportRequest(new Request("http://localhost"+started.jobUrl),["export","status",jobId],f.config,none);
    job=await response.json();
    if(job.status==="failed")break;
    assert.equal(job.status,"preparing");
    await delay(20);
  }
  assert.equal(job.status,"failed");
  assert.match(job.error,/没有可导出/);
  assert.equal(globalThis.encyclopediaExports.preparing,false);
  const missing=await exportRequest(new Request("http://localhost/api/encyclopedia/export/status/missing"),["export","status","missing"],f.config,none);
  assert.equal(missing.status,404);
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
  await assert.rejects(createCompletedArchive(f.config,f.states,signal,{includeOriginals:true}),/路径/);
  const controller=new AbortController();
  function abortingStates() {setImmediate(function abort() {controller.abort();});return f.states();}
  await assert.rejects(createCompletedArchive(f.config,abortingStates,controller.signal),{name:"AbortError"});
  assert.deepEqual(tempExports(),before);
});

test("HTTP permits download retries and defers cleanup until active transfers close", async function(t) {
  const f=fixture(t);
  const pending=exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  const duplicate=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  assert.equal(duplicate.status,409);
  const response=await pending;
  const result=await readyExport(response,f.config,f.states);
  const token=result.url.split("/").at(-1);
  const record=globalThis.encyclopediaExports.downloads.get(token);
  const staging=path.dirname(record.archive.file);
  const request=new Request("http://localhost"+result.url);
  const download=await exportRequest(request,["export",token],f.config,f.states);
  assert.equal(download.headers.get("Content-Type"),"application/zip");
  assert.match(download.headers.get("Content-Disposition"),/attachment/);
  const bytes=Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.length,Number(download.headers.get("Content-Length")));
  assert.equal((await unzip(bytes)).has("manifest.json"),true);
  const retry=await exportRequest(request,["export",token],f.config,f.states);
  assert.equal(retry.status,200);
  const removed=await exportRequest(new Request(request.url,{method:"DELETE"}),["export",token],f.config,f.states);
  assert.equal(removed.status,204);
  assert.equal(fs.existsSync(staging),true,"an active download must survive link expiry/removal");
  assert.equal((await exportRequest(request,["export",token],f.config,f.states)).status,404);
  assert.deepEqual(Buffer.from(await retry.arrayBuffer()),bytes);
  for(let attempt=0;attempt<30&&fs.existsSync(staging);attempt++)await delay(20);
  assert.equal(fs.existsSync(staging),false);
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

test("cancelling a download keeps the archive available for retry until removal", async function(t) {
  const f=fixture(t);
  const prepared=await exportRequest(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"],f.config,f.states);
  const result=await readyExport(prepared,f.config,f.states);
  const token=result.url.split("/").at(-1);
  const record=globalThis.encyclopediaExports.downloads.get(token);
  const download=await exportRequest(new Request("http://localhost"+result.url),["export",token],f.config,f.states);
  await download.body.cancel();
  assert.equal(globalThis.encyclopediaExports.downloads.has(token),true);
  const retry=await exportRequest(new Request("http://localhost"+result.url),["export",token],f.config,f.states);
  assert.equal(retry.status,200);
  assert.equal((await unzip(Buffer.from(await retry.arrayBuffer()))).has("manifest.json"),true);
  await exportRequest(new Request("http://localhost"+result.url,{method:"DELETE"}),["export",token],f.config,f.states);
  for(let attempt=0;attempt<30&&fs.existsSync(record.archive.file);attempt++)await delay(20);
  assert.equal(fs.existsSync(record.archive.file),false);
});

test("export polling survives transient connection failures without submitting another job", async function(t) {
  let calls = 0;
  t.mock.method(globalThis,"fetch",async function fetchStatus(url,init) {
    assert.equal(url,"/api/encyclopedia/export/status/test-job");
    assert.equal(init.method,undefined);
    calls += 1;
    if (calls === 1) throw new TypeError("Failed to fetch");
    if (calls === 2) return Response.json({error:"temporary"},{status:502});
    if (calls === 3) return Response.json({status:"preparing"});
    return Response.json({status:"ready",url:"/download",count:2});
  });
  const result=await waitForArchive("/api/encyclopedia/export/status/test-job",new AbortController().signal,1);
  assert.equal(result.count,2);
  assert.equal(calls,4);
});

test("export polling surfaces real failures and aborts promptly while waiting", async function(t) {
  t.mock.method(globalThis,"fetch",async function failedJob() {
    return Response.json({status:"failed",error:"图片校验失败"});
  });
  await assert.rejects(waitForArchive("/job",new AbortController().signal,1),/图片校验失败/);
  t.mock.method(globalThis,"fetch",async function expiredJob() {
    return Response.json({error:"导出任务已过期"},{status:404});
  });
  await assert.rejects(waitForArchive("/job",new AbortController().signal,1),/已过期/);
  const controller=new AbortController();
  t.mock.method(globalThis,"fetch",async function preparing() {
    setTimeout(function abort() {controller.abort();},10);
    return Response.json({status:"preparing"});
  });
  await assert.rejects(waitForArchive("/job",controller.signal,60000),{name:"AbortError"});
});

test("gateway retries a disconnected read but never duplicates an export POST", async function(t) {
  const previousUrl=process.env.ENCYCLOPEDIA_BACKEND_URL;
  const previousToken=process.env.ENCYCLOPEDIA_BACKEND_TOKEN;
  process.env.ENCYCLOPEDIA_BACKEND_URL="http://127.0.0.1:1";
  process.env.ENCYCLOPEDIA_BACKEND_TOKEN="test-token";
  t.after(function restoreEnvironment() {
    if(previousUrl===undefined)delete process.env.ENCYCLOPEDIA_BACKEND_URL;
    else process.env.ENCYCLOPEDIA_BACKEND_URL=previousUrl;
    if(previousToken===undefined)delete process.env.ENCYCLOPEDIA_BACKEND_TOKEN;
    else process.env.ENCYCLOPEDIA_BACKEND_TOKEN=previousToken;
  });
  let calls=0;
  t.mock.method(globalThis,"fetch",async function interruptedRead() {
    calls+=1;
    if(calls===1)throw new TypeError("fetch failed");
    return Response.json({status:"preparing"});
  });
  const read=await encyclopediaGateway(new Request("http://localhost/api/encyclopedia/export/status/test"),["export","status","test"]);
  assert.equal(read.status,200);
  assert.equal(calls,2);
  calls=0;
  t.mock.method(console,"error",function ignored() {});
  t.mock.method(globalThis,"fetch",async function interruptedWrite() {
    calls+=1;
    throw new TypeError("fetch failed");
  });
  const write=await encyclopediaGateway(new Request("http://localhost/api/encyclopedia/export",{method:"POST"}),["export"]);
  assert.equal(write.status,502);
  assert.equal(calls,1);
});
