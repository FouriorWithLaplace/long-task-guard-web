import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { applySchemaMigration } from '../src/server/encyclopedia/schema-migration.mjs';

test('policy migration releases frozen fields without touching content or system rules', async function () {
  const portal = process.env.ENCYCLOPEDIA_PORTAL_ROOT || path.resolve('..', 'FusionNexus', 'portal');
  const contract = await import(pathToFileURL(path.join(portal, 'src/lib/encyclopedia-schema-revision.mjs')).href);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE encyclopedia_workspace(id INTEGER);
      CREATE TABLE wiki_entry_schema_migrations(version INTEGER PRIMARY KEY,sha256 TEXT);
      INSERT INTO wiki_entry_schema_migrations VALUES(5,'previous');
      CREATE TABLE wiki_column_fields(type_key TEXT,storage TEXT,field_key TEXT,collection_mode TEXT,description TEXT,source_policy TEXT,contract_version INTEGER);
      INSERT INTO wiki_column_fields VALUES
        ('person','fields','career','paused','人物新增采集统一暂停，保留现有内容，恢复前不自动补充身份、履历和关系。 履历',NULL,5),
        ('device','fields','assessment','paused','有来源的评价',NULL,5),
        ('paper','fields','citation_count','paused','外部历史引用',NULL,5),
        ('person','fields','quality_score','system','计算评分',NULL,5),
        ('person','identity','name','system','身份',NULL,5);
      CREATE TABLE content(id INTEGER,value TEXT);
      INSERT INTO content VALUES(1,'existing content and evidence');
    `);
    const protectedRows = db.prepare("SELECT * FROM wiki_column_fields WHERE collection_mode='system'").all();
    const content = db.prepare('SELECT * FROM content').all();
    const result = applySchemaMigration(db, contract, 'new-fingerprint');
    assert.equal(result.releasedFields, 3);
    assert.equal(result.policyOnly, true);
    assert.equal(db.prepare("SELECT count(*) n FROM wiki_column_fields WHERE collection_mode='paused'").get().n, 0);
    assert.equal(db.prepare("SELECT description FROM wiki_column_fields WHERE field_key='career'").get().description, '履历');
    assert.deepEqual(db.prepare("SELECT * FROM wiki_column_fields WHERE collection_mode='system'").all(), protectedRows);
    assert.deepEqual(db.prepare('SELECT * FROM content').all(), content);
    assert.deepEqual(applySchemaMigration(db, contract, 'new-fingerprint'), {alreadyApplied: true});
    assert.throws(function conflictingRevision() {
      applySchemaMigration(db, contract, 'different-fingerprint');
    }, /fingerprint conflict/);
  } finally {
    db.close();
  }
});
