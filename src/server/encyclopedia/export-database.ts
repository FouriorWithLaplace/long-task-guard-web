import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { setImmediate as yieldToRequests } from "node:timers/promises";
import { identifier } from "./database.ts";
import type { EncyclopediaPaths } from "./config.ts";
import { taskFilterGroup } from "../../types/encyclopedia.ts";
import type { TaskFilterState } from "../../types/encyclopedia.ts";

type SchemaRow = { type: string; name: string; sql: string };
type ForeignKey = { table: string; from: string; to: string };

// 字典和库级设置保持完整；采集输入、未绑定的候选及整库批次报告不属于导出词条。
const sharedTables = new Set([
  "encyclopedia_workspace", "system_config", "wiki_collection_policies",
  "wiki_column_fields", "wiki_column_storage", "wiki_entry_display_settings",
  "wiki_entry_schema_migrations", "wiki_entry_types", "wiki_field_definition_versions",
  "wiki_index_state", "wiki_topic_details", "wiki_topics",
]);
const emptyTables = new Set([
  "wiki_candidate_manifests", "wiki_candidate_nodes", "wiki_candidate_relations",
  "wiki_collection_errors", "wiki_editorial_batches", "wiki_identity_reviews",
]);
// 按依赖顺序复制共享记录，仅保留已导出行引用的记录。
const referenceTables = [
  "wiki_expansion_candidates", "wiki_catalog_source_versions", "wiki_person_career_events",
  "wiki_original_documents", "wiki_media_assets", "wiki_source_documents",
  "wiki_evidence_sources", "users",
];

export async function exportDatabase(
  config: EncyclopediaPaths,
  destination: string,
  readStates: () => Map<number, TaskFilterState>,
  signal: AbortSignal,
) {
  const db = new DatabaseSync(destination);
  try {
    db.exec("PRAGMA foreign_keys=OFF; PRAGMA busy_timeout=5000");
    const sourceUrl = pathToFileURL(config.database);
    sourceUrl.searchParams.set("mode", "ro");
    db.prepare("ATTACH DATABASE ? AS source").run(sourceUrl.href);
    db.exec("BEGIN");
    // 在第一次让出执行权前，同时确定任务名单和业务库的读取快照。
    const schema = db.prepare("SELECT type,name,sql FROM source.sqlite_master WHERE sql IS NOT NULL ORDER BY rowid").all() as SchemaRow[];
    if (!schema.some(function marker(row) { return row.name === "encyclopedia_workspace"; }) ||
        schema.some(function marker(row) { return row.name === "encyclopedia_release"; }))
      throw new Error("仅允许导出百科维护库。");
    const completed: number[] = [];
    for (const [id, state] of readStates()) {
      if (taskFilterGroup(state) === "completed") completed.push(id);
    }
    db.exec("CREATE TEMP TABLE export_ids(id INTEGER PRIMARY KEY)");
    db.prepare(`INSERT INTO export_ids SELECT e.id FROM source.entities e
      JOIN source.wiki_entry_profiles p ON p.entity_id=e.id
      WHERE e.deleted_at IS NULL AND e.id IN (SELECT value FROM json_each(?))`).run(JSON.stringify(completed));
    const ids = db.prepare("SELECT id FROM export_ids ORDER BY id").all().map(function id(row) { return Number(row.id); });
    if (!ids.length) throw new Error("当前没有可导出的已完成词条。");

    const tableKinds = new Map(db.prepare("PRAGMA source.table_list").all().map(function pair(row) {
      return [String(row.name), String(row.type)];
    }));
    const tables = schema.filter(function table(row) {
      return row.type === "table" && !row.name.startsWith("sqlite_") && tableKinds.get(row.name) !== "shadow";
    });
    const foreignKeys = new Map<string, ForeignKey[]>();
    const columns = new Map<string, string[]>();
    for (const table of tables) {
      db.exec(table.sql);
      foreignKeys.set(table.name, db.prepare("PRAGMA source.foreign_key_list(" + identifier(table.name) + ")").all() as ForeignKey[]);
      columns.set(table.name, db.prepare("PRAGMA source.table_info(" + identifier(table.name) + ")").all().map(function name(row) { return String(row.name); }));
    }

    async function copy(name: string, where: string) {
      signal.throwIfAborted();
      const names = columns.get(name)!;
      // FTS 行号被辅助映射表引用，必须连同原始 ID 保留。
      const fields = tableKinds.get(name) === "virtual" ? ["rowid", ...names] : names;
      const quoted = fields.map(identifier).join(",");
      db.exec("INSERT INTO main." + identifier(name) + " (" + quoted + ") SELECT " + quoted +
        " FROM source." + identifier(name) + " AS item WHERE " + where);
      await yieldToRequests();
    }

    for (const table of tables) {
      const name = table.name;
      if (referenceTables.includes(name) || emptyTables.has(name)) continue;
      if (sharedTables.has(name)) { await copy(name, "1"); continue; }
      if (name === "entities") { await copy(name, "id IN (SELECT id FROM export_ids)"); continue; }
      const conditions: string[] = [];
      const names = columns.get(name)!;
      if (names.includes("entity_id")) conditions.push("entity_id IN (SELECT id FROM export_ids)");
      for (const key of foreignKeys.get(name)!) {
        if (key.table === "entities" && key.from !== "entity_id") {
          const column = identifier(key.from);
          conditions.push("(" + column + " IS NULL OR " + column + " IN (SELECT id FROM export_ids))");
        }
        if (key.table === "wiki_expansion_candidates") {
          const column = identifier(key.from);
          conditions.push("(" + column + " IS NULL OR " + column + " IN (SELECT id FROM source.wiki_expansion_candidates WHERE entity_id IS NULL OR entity_id IN (SELECT id FROM export_ids)))");
        }
      }
      if (!conditions.length) throw new Error("尚未定义表的导出范围：" + name);
      await copy(name, conditions.join(" AND "));
    }

    for (const name of referenceTables) {
      if (!columns.has(name)) continue;
      const references: string[] = [];
      if (name === "wiki_catalog_source_versions") references.push("source_id IN (SELECT id FROM main.wiki_catalog_sources)");
      else if (name === "wiki_person_career_events") references.push("person_id IN (SELECT entity_id FROM main.wiki_type_person)");
      else {
        for (const [child, keys] of foreignKeys) {
          for (const key of keys) {
            if (key.table !== name) continue;
            references.push(identifier(key.to) + " IN (SELECT " + identifier(key.from) + " FROM main." + identifier(child) + ")");
          }
        }
        if (name === "wiki_expansion_candidates") references.push("entity_id IN (SELECT id FROM export_ids)");
      }
      await copy(name, references.length ? "(" + references.join(" OR ") + ")" : "0");
    }

    // 恢复自增序列、索引、视图和触发器；复制数据期间不运行业务触发器。
    if (schema.some(function sequence(row) { return row.name === "sqlite_sequence"; })) {
      db.exec("DELETE FROM main.sqlite_sequence; INSERT INTO main.sqlite_sequence SELECT * FROM source.sqlite_sequence");
    }
    for (const row of schema) {
      if (row.type === "index" || row.type === "view" || row.type === "trigger") db.exec(row.sql);
    }
    for (const pragma of ["user_version", "application_id"]) {
      const value = Number(Object.values(db.prepare("PRAGMA source." + pragma).get()!)[0]);
      db.exec("PRAGMA main." + pragma + "=" + value);
    }
    signal.throwIfAborted();
    if (db.prepare("PRAGMA main.foreign_key_check").get()) throw new Error("导出数据库的关联完整性检查未通过。");
    const integrity = db.prepare("PRAGMA main.integrity_check").get();
    if (integrity?.integrity_check !== "ok") throw new Error("导出数据库完整性检查未通过。");
    db.exec("COMMIT");
    return ids;
  } finally {
    db.close();
  }
}
