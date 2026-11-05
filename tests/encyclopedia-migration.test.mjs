import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {paths} from '../src/server/encyclopedia/config.ts';
import {exportDatabase} from '../src/server/encyclopedia/export-database.ts';
import {applySchemaMigration,schemaFingerprint} from '../src/server/encyclopedia/schema-migration.mjs';

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
  const before=db.prepare("SELECT p.entity_id,e.name,p.type_key FROM wiki_entry_profiles p JOIN entities e ON e.id=p.entity_id").all();
  const report=applySchemaMigration(db,contract,fingerprint);
  if(!report.alreadyApplied)assert.equal(report.totalAfter,before.length-report.removedIds.length);
  assert.equal(db.prepare("SELECT count(*) n FROM wiki_entry_profiles WHERE type_key IN ('event','code')").get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  const concept=db.prepare("SELECT * FROM wiki_entry_profiles WHERE type_key='concept'").get();
  assert.deepEqual(Object.keys(JSON.parse(concept.fields)),['content']);
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
 }finally{db.close();}
});
