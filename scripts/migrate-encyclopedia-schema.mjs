import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
  applySchemaMigration,
  migrationPlan,
  schemaFingerprint,
} from "../src/server/encyclopedia/schema-migration.mjs";

// Run with collection writers stopped. Rehearsal is mandatory even with --apply.
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === "--apply") options.apply = true;
  else if (
    ["--database", "--contract", "--backup", "--state"].includes(key) &&
    process.argv[i + 1]
  )
    options[key.slice(2)] = path.resolve(process.argv[++i]);
  else throw Error("Unknown/incomplete option: " + key);
}
for (const key of ["database", "contract", "backup", "state"])
  if (!options[key]) throw Error("Required: --" + key);
if (fs.existsSync(options.backup))
  throw Error("Backup directory must be new; never overwrite a backup");
fs.mkdirSync(options.backup, { recursive: true });
const contract = await import(pathToFileURL(options.contract).href);
const fingerprint = schemaFingerprint(fs.readFileSync(options.contract));
const temp = fs.mkdtempSync(
  path.join(os.tmpdir(), "encyclopedia-schema-rehearsal-"),
);
const manifest = {
  createdAt: new Date().toISOString(),
  database: options.database,
  contract: fingerprint,
  backup: options.backup,
  applied: false,
};
function saveManifest() {
  fs.writeFileSync(
    path.join(options.backup, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
function log(message) {
  console.log(new Date().toISOString() + " " + message);
}
function inspect(db) {
  const identities = db
    .prepare(
      "SELECT e.id,e.name,p.type_key FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id ORDER BY e.id",
    )
    .all();
  const evidence = db
    .prepare(
      "SELECT entity_id,count(*) n FROM wiki_entry_evidence GROUP BY entity_id",
    )
    .all();
  return { identities, evidence };
}
function verify(db, before) {
  const expected = before.identities.filter(function retained(row) {
    return !contract.REMOVED_TYPES.includes(row.type_key);
  });
  const actual = inspect(db);
  if (
    !isDeepStrictEqual(
      actual.identities.map(function identity(row) {
        return [row.id, row.name];
      }),
      expected.map(function identity(row) {
        return [row.id, row.name];
      }),
    )
  )
    throw Error("Retained entry identities changed");
  const retained = new Set(
    expected.map(function id(row) {
      return row.id;
    }),
  );
  const evidence = new Map(
    actual.evidence.map(function pair(row) {
      return [row.entity_id, row.n];
    }),
  );
  for (const row of before.evidence)
    if (
      retained.has(row.entity_id) &&
      (evidence.get(row.entity_id) || 0) < row.n
    )
      throw Error("Evidence lost for entry " + row.entity_id);
  if (db.prepare("PRAGMA foreign_key_check").get())
    throw Error("Foreign-key check failed");
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw Error("Integrity check failed: " + JSON.stringify(integrity));
  for (const row of db.prepare("SELECT key FROM wiki_entry_types").all()) {
    const count = db
      .prepare("SELECT count(*) n FROM wiki_entry_profiles WHERE type_key=?")
      .get(row.key).n;
    if (
      db.prepare('SELECT count(*) n FROM "wiki_type_' + row.key + '"').get()
        .n !== count
    )
      throw Error("Profile/column count mismatch: " + row.key);
  }
  return db
    .prepare(
      "SELECT type_key,count(*) entries FROM wiki_entry_profiles GROUP BY type_key ORDER BY type_key",
    )
    .all();
}
let source;
try {
  source = new DatabaseSync(options.database, { readOnly: true });
  source.exec("PRAGMA busy_timeout=10000");
  const before = inspect(source);
  manifest.plan = migrationPlan(source, contract).map(function type(plan) {
    return {
      key: plan.key,
      before: plan.previous.map(function field(row) {
        return row.storage + "." + row.field_key;
      }),
      after: plan.definitions.map(function field(row) {
        return row.storage + "." + row.key;
      }),
    };
  });
  saveManifest();
  log("Creating durable database backup");
  await backup(source, path.join(options.backup, "encyclopedia.db"));
  source.close();
  source = null;
  const state = new DatabaseSync(options.state, { readOnly: true });
  try {
    await backup(state, path.join(options.backup, "state.sqlite"));
  } finally {
    state.close();
  }
  fs.copyFileSync(
    options.contract,
    path.join(options.backup, "schema-contract.mjs"),
  );
  log("Backups complete; starting full isolated rehearsal");
  const rehearsalFile = path.join(temp, "encyclopedia.db");
  fs.copyFileSync(path.join(options.backup, "encyclopedia.db"), rehearsalFile);
  const rehearsal = new DatabaseSync(rehearsalFile);
  try {
    manifest.rehearsal = applySchemaMigration(rehearsal, contract, fingerprint);
    if (!applySchemaMigration(rehearsal, contract, fingerprint).alreadyApplied)
      throw Error("Migration is not idempotent");
    manifest.counts = verify(rehearsal, before);
  } finally {
    rehearsal.close();
  }
  saveManifest();
  log("Rehearsal and full integrity verification passed");
  if (options.apply) {
    const live = new DatabaseSync(options.database);
    try {
      live.exec("PRAGMA busy_timeout=10000");
      if (!isDeepStrictEqual(inspect(live), before))
        throw Error(
          "Database changed after backup; stop writers and rerun with a new backup directory",
        );
      log("Applying transactional migration to the local maintenance database");
      manifest.live = applySchemaMigration(live, contract, fingerprint);
      manifest.applied = true;
      saveManifest();
      manifest.counts = verify(live, before);
      live.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      manifest.verifiedAt = new Date().toISOString();
    } finally {
      live.close();
    }
    saveManifest();
    log("Live readback and integrity verification passed");
  }
  console.log(
    JSON.stringify(
      {
        backup: options.backup,
        applied: manifest.applied,
        counts: manifest.counts,
      },
      null,
      2,
    ),
  );
} catch (error) {
  manifest.error = String(error.stack || error);
  saveManifest();
  throw error;
} finally {
  source?.close();
  const resolved = fs.realpathSync(temp);
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("encyclopedia-schema-rehearsal-")
  )
    throw Error("Unexpected rehearsal directory");
  fs.rmSync(resolved, { recursive: true, force: true });
}
