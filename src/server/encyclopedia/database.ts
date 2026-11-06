import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { categories, taskFilterGroup, taskFilters } from "../../types/encyclopedia.ts";
import type {
  EntryDetail,
  EntrySummary,
  FieldDefinition,
  Json,
  OriginalDocument,
  TaskFilterState,
} from "../../types/encyclopedia.ts";
import type { EncyclopediaPaths } from "./config.ts";

export function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
export function object(value: unknown): Record<string, Json> {
  if (typeof value === "string") return object(JSON.parse(value));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("数据库中的对象格式不正确。");
  return value as Record<string, Json>;
}
export function identifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw new Error("无效数据库列名。");
  return '"' + value + '"';
}
export function openDatabase(config: EncyclopediaPaths, readOnly = true) {
  if (!fs.existsSync(config.database))
    throw new Error("目标百科数据库不存在，不会自动创建空库。");
  const db = new DatabaseSync(config.database, { readOnly });
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    const marker = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('encyclopedia_workspace','encyclopedia_release')",
      )
      .all();
    if (
      !marker.some(function workspace(row) {
        return row.name === "encyclopedia_workspace";
      }) ||
      marker.some(function release(row) {
        return row.name === "encyclopedia_release";
      })
    ) {
      throw new Error("仅允许访问已标识的百科维护库。");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

const entrySelect = `SELECT e.id,e.name,e.name_en,p.type_key,p.state,p.version,t.name type_name
  FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id JOIN wiki_entry_types t ON t.key=p.type_key`;
function summary(row: Record<string, unknown>): EntrySummary {
  return {
    id: Number(row.id),
    name: String(row.name),
    nameEn: String(row.name_en || ""),
    type: String(row.type_key),
    typeName: String(row.type_name),
    state: String(row.state),
    version: Number(row.version),
  };
}
export function categoryTypes(db: DatabaseSync, key: string): string[] {
  const category = categories.find(function match(item) {
    return item.key === key;
  });
  if (!category) throw new Error("不存在的分类。");
  if (key !== "entry") return category.types;
  const dedicated = categories.flatMap(function types(item) {
    return item.types;
  });
  return db
    .prepare("SELECT key FROM wiki_entry_types ORDER BY key")
    .all()
    .map(function name(row) {
      return String(row.key);
    })
    .filter(function other(type) {
      return !dedicated.includes(type) && !["code", "event"].includes(type);
    });
}
export function readCategories(config: EncyclopediaPaths) {
  const db = openDatabase(config);
  try {
    const counts = db
      .prepare(
        "SELECT p.type_key,count(*) total,sum(p.state='excluded') excluded FROM wiki_entry_profiles p JOIN entities e ON e.id=p.entity_id WHERE e.deleted_at IS NULL GROUP BY p.type_key",
      )
      .all();
    return categories.map(function category(item) {
      const types = categoryTypes(db, item.key);
      let total = 0;
      let excluded = 0;
      for (const row of counts)
        if (types.includes(String(row.type_key))) {
          total += Number(row.total);
          excluded += Number(row.excluded);
        }
      return { ...item, types, total, excluded };
    });
  } finally {
    db.close();
  }
}

export function markdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

export function readCategoryFieldMarkdown(config: EncyclopediaPaths, key: string) {
  const db = openDatabase(config);
  try {
    const category = categories.find(function match(item) {
      return item.key === key;
    });
    if (!category) throw new Error("不存在的分类。");
    const types = categoryTypes(db, key);
    const rows = types.length
      ? db.prepare(
          "SELECT type_key,table_name,column_name,field_key,label,group_name,storage,description,definition,value_type,collection_mode FROM wiki_column_fields WHERE type_key IN (" +
            types.map(function placeholder() { return "?"; }).join(",") +
            ") ORDER BY type_key,storage,ordinal,field_key",
        ).all(...types)
      : [];
    const lines = [
      "# " + category.name + "字段表",
      "",
      "> 字段来源：百科字段字典。只读身份字段和暂停采集字段保留在表中，便于查看，但不会被自动填充。",
      "",
      "| 子类型 | 字段键 | 字段名称 | 分组 | 存储 | 类型 | 采集规则 | 可自动填充 | 说明 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    for (const row of rows) {
      const collectionMode = String(row.collection_mode || "");
      const writable =
        String(row.storage) !== "identity" &&
        !["name", "entity_id"].includes(String(row.field_key)) &&
        !["system", "identity_review", "paused"].includes(collectionMode);
      lines.push(
        "| " +
          [
            row.type_key,
            String(row.storage) + "." + String(row.field_key),
            row.label,
            row.group_name || "",
            row.storage,
            row.value_type || "text",
            collectionMode || "default",
            writable ? "是" : "否",
            row.description || row.definition || "",
          ].map(markdownCell).join(" | ") +
          " |",
      );
    }
    if (!rows.length) lines.push("| — | — | 当前分类没有字段定义 | — | — | — | — | — | — |");
    return lines.join("\n") + "\n";
  } finally {
    db.close();
  }
}

export function readEntries(
  config: EncyclopediaPaths,
  key: string,
  query = "",
  requestedPage = 1,
  status = "all",
  phases: Map<number, TaskFilterState> = new Map(),
  idsOnly = false,
) {
  if (
    !taskFilters.some(function valid(filter) {
      return filter.value === status;
    })
  )
    throw new Error("未知的任务筛选条件。");
  const db = openDatabase(config);
  try {
    const types = categoryTypes(db, key);
    if (!types.length) return { entries: [], total: 0, page: 1, pages: 1 };
    const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
    let where = ` WHERE e.deleted_at IS NULL AND p.type_key IN (${types
      .map(function placeholder() {
        return "?";
      })
      .join(
        ",",
      )}) AND (e.name LIKE ? ESCAPE '\\' OR e.name_en LIKE ? ESCAPE '\\' OR CAST(e.id AS TEXT)=?)`;
    const values = [...types, pattern, pattern, query];
    if (status !== "all") {
      const ids: number[] = [];
      for (const [id, phase] of phases) {
        if (
          status === "never" ||
          taskFilterGroup(phase) === status
        )
          ids.push(id);
      }
      const exclude = status === "never";
      where += ` AND e.id ${exclude ? "NOT IN" : "IN"} (SELECT value FROM json_each(?))`;
      values.push(JSON.stringify(ids));
    }
    if (idsOnly) {
      const rows = db
        .prepare(
          "SELECT e.id FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id" +
            where +
            " ORDER BY e.id",
        )
        .all(...values);
      return {
        entries: [],
        total: rows.length,
        page: 1,
        pages: Math.max(1, Math.ceil(rows.length / 30)),
        ids: rows.map(function id(row) {
          return Number(row.id);
        }),
      };
    }
    const total = Number(
      db
        .prepare(
          "SELECT count(*) n FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id" +
            where,
        )
        .get(...values)?.n || 0,
    );
    const pages = Math.max(1, Math.ceil(total / 30));
    const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
    const entries = db
      .prepare(entrySelect + where + " ORDER BY e.id LIMIT 30 OFFSET ?")
      .all(...values, (page - 1) * 30)
      .map(summary);
    return { entries, total, page, pages };
  } finally {
    db.close();
  }
}
export function originalPath(config: EncyclopediaPaths, relative: string) {
  // 历史 Windows 索引使用反斜杠；仅规范化读取路径，不改写原索引。
  relative = relative.replace(/\\/g, "/");
  if (
    !relative ||
    /(^\/|\\|:|\0)/.test(relative) ||
    relative.split("/").some(function invalid(part) {
      return !part || part === ".." || part === ".";
    })
  )
    throw new Error("原件路径不合法。");
  const root = fs.realpathSync(config.dataRoot);
  const resolved = path.resolve(root, relative);
  const candidate = fs.existsSync(resolved)
    ? fs.realpathSync(resolved)
    : resolved;
  const within = path.relative(root, candidate);
  if (within.startsWith("..") || path.isAbsolute(within))
    throw new Error("原件路径越界。");
  return candidate;
}
export function readDetail(
  config: EncyclopediaPaths,
  id: number,
  existing?: DatabaseSync,
): EntryDetail {
  const db = existing || openDatabase(config);
  try {
    const row = db
      .prepare(entrySelect + " WHERE e.id=? AND e.deleted_at IS NULL")
      .get(id);
    if (!row) throw Object.assign(new Error("词条不存在或已经删除。"), { code: "ENTRY_NOT_FOUND" });
    const definitions = db
      .prepare(
        "SELECT * FROM wiki_column_fields WHERE type_key=? ORDER BY storage,ordinal,field_key",
      )
      .all(String(row.type_key));
    const types = new Map(
      db
        .prepare(
          "SELECT column_name,json_type FROM wiki_column_value_types WHERE entity_id=?",
        )
        .all(id)
        .map(function pair(item) {
          return [String(item.column_name), String(item.json_type)];
        }),
    );
    const tables = new Map<string, Record<string, unknown>>();
    const fields: FieldDefinition[] = [];
    for (const definition of definitions) {
      const table = String(definition.table_name);
      if (!tables.has(table)) {
        if (table !== "wiki_type_" + row.type_key)
          throw new Error("字段字典的内容表不匹配。");
        const values = db
          .prepare("SELECT * FROM " + identifier(table) + " WHERE entity_id=?")
          .get(id);
        tables.set(table, values || {});
      }
      const column = String(definition.column_name);
      let value = tables.get(table)?.[column] ?? null;
      const type = types.get(column);
      if (typeof value === "string" && type && type !== "text")
        value = JSON.parse(value);
      const storage = String(definition.storage);
      const fieldKey = String(definition.field_key);
      const mode = definition.collection_mode;
      const writable =
        storage !== "identity" &&
        !["name", "entity_id"].includes(fieldKey) &&
        !["system", "identity_review", "paused"].includes(String(mode));
      fields.push({
        key: storage + "." + fieldKey,
        label: String(definition.label),
        group: String(definition.group_name || "基本信息"),
        storage,
        fieldKey,
        column,
        table,
        value: value as Json,
        valueType: definition.value_type ? String(definition.value_type) : null,
        description: String(
          definition.description ||
            definition.definition ||
            "按字段含义采集；保留主体、版本、时间及单位。",
        ),
        rules: definition as Record<string, Json>,
        writable,
      });
    }
    const documents = db
      .prepare(
        "SELECT d.path,d.sha256,d.size,d.blob_path FROM wiki_original_documents d JOIN wiki_entry_files f ON f.document_path=d.path WHERE f.entity_id=?",
      )
      .all(id);
    const originals = documents.map(function document(item) {
      return {
        ...item,
        localPath: originalPath(config, String(item.blob_path)),
      } as unknown as OriginalDocument;
    });
    const evidence = db
      .prepare(
        `SELECT s.id sourceId,e.field,s.title,s.uri,e.excerpt,e.locator FROM wiki_entry_evidence e JOIN wiki_evidence_sources s ON s.id=e.source_id WHERE e.entity_id=? ORDER BY s.id DESC LIMIT 150`,
      )
      .all(id);
    return {
      ...summary(row),
      fields,
      originals,
      evidence: evidence as unknown as EntryDetail["evidence"],
      dictionaryHash: hash(JSON.stringify(definitions)),
    };
  } finally {
    if (!existing) db.close();
  }
}

export function readSource(
  config: EncyclopediaPaths,
  entityId: number,
  sourceId: number,
) {
  const db = openDatabase(config);
  try {
    const row = db
      .prepare(
        "SELECT s.* FROM wiki_evidence_sources s WHERE s.id=? AND EXISTS(SELECT 1 FROM wiki_entry_evidence e WHERE e.source_id=s.id AND e.entity_id=?)",
      )
      .get(sourceId, entityId);
    if (!row || hash(String(row.snapshot)) !== row.fingerprint)
      throw new Error("来源不存在、未关联当前词条或指纹校验失败。");
    return row;
  } finally {
    db.close();
  }
}
