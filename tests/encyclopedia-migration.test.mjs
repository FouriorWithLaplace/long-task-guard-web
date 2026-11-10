import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {paths} from '../src/server/encyclopedia/config.ts';
import {exportDatabase} from '../src/server/encyclopedia/export-database.ts';
import {applySchemaMigration,schemaFingerprint,preserveNonNameEnglishValue} from '../src/server/encyclopedia/schema-migration.mjs';
import {readDetail} from '../src/server/encyclopedia/database.ts';
import {updateComputedFields} from '../src/server/encyclopedia/computed.ts';

test('legacy review objects in English-name columns remain review data', function () {
 const original = {state:'reviewed',basis:'source evidence'};
 const aliases = preserveNonNameEnglishValue(original, ['Known alias']);
 assert.deepEqual(aliases[0], ['Known alias']);
 assert.deepEqual(aliases[1].legacy_english_name, original);
 assert.match(aliases[1].note, /非名称数据/);
 assert.equal(preserveNonNameEnglishValue('English name', null), null);
});

test('migrate an isolated real-schema subset: values, deletion, triggers, free JSON, foreign keys and idempotence',async function(t){
 const portal=process.env.ENCYCLOPEDIA_PORTAL_ROOT||path.resolve('..','FusionNexus','portal');
 const contractFile=path.join(portal,'src/lib/encyclopedia-schema-revision.mjs');
 if(!fs.existsSync(paths.database)||!fs.existsSync(contractFile)){t.skip('Paired local encyclopedia projects are not installed');return;}
 const contract=await import(pathToFileURL(contractFile).href);
 const fingerprint=schemaFingerprint(fs.readFileSync(contractFile));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'encyclopedia-migration-test-'));
 t.after(function cleanup(){fs.rmSync(root,{recursive:true,force:true});});
 const file=path.join(root,'encyclopedia.db');
 const source=new DatabaseSync(paths.database,{readOnly:true});
 let ids;
 try{ids=source.prepare("SELECT min(e.id) id FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id WHERE e.deleted_at IS NULL GROUP BY p.type_key").all().map(function id(row){return row.id;});}
 finally{source.close();}
 await exportDatabase(paths,file,function states(){return new Map(ids.map(function pair(id){return [id,'completed'];}));},new AbortController().signal);
 const db=new DatabaseSync(file);
 try{
  // Recreate one legacy organization value even when the source is already upgraded.
  // This ensures the actual migration runs on every test invocation.
  const organization=db.prepare("SELECT * FROM wiki_entry_profiles WHERE type_key='org'").get();
  const legacyName={state:'reviewed',basis:'Synthetic review record, not an English name'};
  for(const trigger of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'wiki_columns_%'").all())
    db.exec('DROP TRIGGER "'+trigger.name+'"');
  if(!db.prepare('PRAGMA table_info(wiki_type_org)').all().some(function(column){return column.name==='english_name';}))
    db.exec('ALTER TABLE wiki_type_org ADD COLUMN english_name TEXT');
  db.prepare("INSERT OR IGNORE INTO wiki_column_fields(type_key,table_name,column_name,field_key,label,group_name,storage,ordinal,value_type,description,collection_mode,contract_version) VALUES('org','wiki_type_org','english_name','english_name','英文名称','基本资料','fields',1,'json','旧字段','evidence_required',3)").run();
  db.prepare('UPDATE entities SET name_en=NULL WHERE id=?').run(organization.entity_id);
  db.prepare('UPDATE wiki_type_org SET name_en=NULL,english_name=? WHERE entity_id=?').run(JSON.stringify(legacyName),organization.entity_id);
  db.prepare("INSERT OR REPLACE INTO wiki_column_value_types(entity_id,column_name,json_type) VALUES(?,'english_name','object')").run(organization.entity_id);
  db.prepare('UPDATE wiki_entry_profiles SET fields=? WHERE entity_id=?').run(JSON.stringify({...JSON.parse(organization.fields),english_name:legacyName}),organization.entity_id);
  db.prepare('DELETE FROM wiki_entry_schema_migrations WHERE version>=?').run(contract.SCHEMA_REVISION);
  const before=db.prepare("SELECT p.entity_id,e.name,p.type_key FROM wiki_entry_profiles p JOIN entities e ON e.id=p.entity_id").all();
  const report=applySchemaMigration(db,contract,fingerprint);
  if(!report.alreadyApplied)assert.equal(report.totalAfter,before.length-report.removedIds.length);
  assert.equal(db.prepare("SELECT count(*) n FROM wiki_entry_profiles WHERE type_key IN ('event','code')").get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const concept=db.prepare("SELECT * FROM wiki_entry_profiles WHERE type_key='concept'").get();
  assert.deepEqual(Object.keys(JSON.parse(concept.fields)),['content',...contract.SCORE_KEYS]);
  for (const type of db.prepare('SELECT key FROM wiki_entry_types').all()) {
   const columns=db.prepare('PRAGMA table_info(wiki_type_'+type.key+')').all();
   for(const key of contract.SCORE_KEYS) {
    assert.equal(columns.find(column=>column.name===key).type,'REAL');
    assert.equal(db.prepare('SELECT count(*) n FROM wiki_type_'+type.key+' WHERE '+key+' IS NOT NULL').get().n,0,'migration must not score existing content');
   }
  }
  const config={...paths,database:file,dataRoot:path.join(portal,'data')};
  const detail=readDetail(config,concept.entity_id,db);
  assert.ok(detail.fields.filter(field=>contract.SCORE_KEYS.includes(field.fieldKey)).every(field=>!field.writable));
  const scored={content:{overview:'核聚变科学'}};
  updateComputedFields(config,db,detail,scored,{});
  assert.equal(scored.completeness_score,100);
  assert.equal(scored.fusion_relevance_score,100);
  db.prepare('UPDATE wiki_entry_profiles SET fields=? WHERE entity_id=?').run(JSON.stringify(scored),concept.entity_id);
  const scoredReadback=readDetail(config,concept.entity_id,db);
  assert.equal(scoredReadback.fields.find(field=>field.fieldKey==='completeness_score').value,100);
  assert.throws(()=>db.prepare('UPDATE wiki_type_concept SET quality_score=101 WHERE entity_id=?').run(concept.entity_id),/CHECK constraint/);
  const paper=db.prepare("SELECT entity_id FROM wiki_entry_profiles WHERE type_key='paper'").get();
  const paperDetail=readDetail(config,paper.entity_id,db);
  for(const key of ['internal_citation_count','is_highly_cited']) {
   const field=paperDetail.fields.find(field=>field.fieldKey===key);
   assert.equal(field.value,null);assert.equal(field.writable,false);
  }
  const device=db.prepare("SELECT * FROM wiki_entry_profiles WHERE type_key='device'").get();
  const fields=JSON.parse(device.fields);
  fields.principle={mechanism:'隔离验证',arbitrary:['A','B']};
  db.prepare('UPDATE wiki_entry_profiles SET fields=? WHERE entity_id=?').run(JSON.stringify(fields),device.entity_id);
  assert.deepEqual(JSON.parse(db.prepare('SELECT principle FROM wiki_type_device WHERE entity_id=?').get(device.entity_id).principle),fields.principle);
  db.prepare('UPDATE wiki_type_device SET principle=? WHERE entity_id=?').run(JSON.stringify({mechanism:'反向同步'}),device.entity_id);
  assert.equal(JSON.parse(db.prepare('SELECT fields FROM wiki_entry_profiles WHERE entity_id=?').get(device.entity_id).fields).principle.mechanism,'反向同步');
  assert.throws(function unknown(){db.prepare('UPDATE wiki_entry_profiles SET fields=? WHERE entity_id=?').run(JSON.stringify({...fields,comparison:'removed'}),device.entity_id);},/COLUMN_UNKNOWN_FIELD/);
  assert.deepEqual(applySchemaMigration(db,contract,fingerprint),{alreadyApplied:true});
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const migratedOrg=db.prepare('SELECT name_en,aliases FROM wiki_type_org WHERE entity_id=?').get(organization.entity_id);
  assert.equal(migratedOrg.name_en,null);
  assert.ok(JSON.stringify(JSON.parse(migratedOrg.aliases)).includes(JSON.stringify(legacyName)));
  assert.equal(db.prepare("SELECT count(*) n FROM wiki_column_fields WHERE type_key='person' AND storage<>'identity' AND collection_mode NOT IN ('paused','system')").get().n,0);
  assert.equal(db.prepare("SELECT collection_mode FROM wiki_column_fields WHERE type_key='device' AND field_key='assessment'").get().collection_mode,'paused');
 }finally{db.close();}
});
