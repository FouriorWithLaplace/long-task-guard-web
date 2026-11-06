import { categories } from "../../types/encyclopedia.ts";
import { identifier, markdownCell, openDatabase } from "./database.ts";
import type { EncyclopediaPaths } from "./config.ts";

// Read schema metadata only, on demand. All tables are read from one SQLite snapshot.
export function readAllFieldMarkdown(config: EncyclopediaPaths) {
  const db = openDatabase(config);
  try {
    db.exec("BEGIN");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'wiki_type_*' ORDER BY name").all();
    const typeNames = new Map(db.prepare("SELECT key,name FROM wiki_entry_types").all().map(function pair(row) {
      return [String(row.key), String(row.name)];
    }));
    const definitions = new Map<string, Record<string, unknown>>();
    for (const row of db.prepare("SELECT table_name,column_name,storage,field_key,label,description,definition,collection_mode FROM wiki_column_fields ORDER BY type_key,ordinal,field_key").all()) {
      definitions.set(String(row.table_name) + "." + String(row.column_name), row);
    }
    const groups = categories.map(function group(category) {
      return { key: category.key, name: category.name, sections: [] as string[] };
    });
    const other = { key: "other", name: "其他数据库类型", sections: [] as string[] };
    let fieldCount = 0;
    for (const row of tables) {
      const table = String(row.name);
      const type = table.slice("wiki_type_".length);
      const category = categories.find(function match(item) { return item.types.includes(type); });
      const groupKey = category?.key || (["code", "event"].includes(type) ? "other" : "entry");
      const group = groups.find(function match(item) { return item.key === groupKey; }) || other;
      const columns = db.prepare("PRAGMA table_xinfo(" + identifier(table) + ")").all();
      const lines = [
        "### " + markdownCell(typeNames.get(type) || type) + "（" + type + "）",
        "",
        "数据库表：`" + table + "`",
        "",
        "| 数据库字段名 | 字段名称 | 数据库类型 | 字段键 | 采集规则 | 说明 |",
        "| --- | --- | --- | --- | --- | --- |",
      ];
      for (const column of columns) {
        if (Number(column.hidden) === 1) continue;
        const definition = definitions.get(table + "." + String(column.name));
        const key = definition ? String(definition.storage) + "." + String(definition.field_key) : "—";
        const values = [
          column.name,
          definition?.label || "—",
          column.type || "未指定",
          key,
          definition?.collection_mode || "—",
          definition?.description || definition?.definition || "",
        ];
        lines.push("| " + values.map(markdownCell).join(" | ") + " |");
        fieldCount++;
      }
      group.sections.push(lines.join("\n"));
    }
    if (other.sections.length) groups.push(other);
    const exportedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    const output = [
      "# 全部分类词条数据库字段",
      "",
      "导出时间：" + exportedAt + "（北京时间）",
      "",
      "共 " + tables.length + " 个词条表，" + fieldCount + " 个数据库字段。",
      "",
      "> 数据库字段名取自本次导出时的实际表结构；中文名称和说明取自当前字段字典。包含身份字段和未登记字典的列，不包含词条内容。",
    ];
    for (const group of groups) {
      output.push("", "## " + group.name, "", group.sections.join("\n\n") || "当前没有对应的词条表。");
    }
    db.exec("COMMIT");
    return output.join("\n") + "\n";
  } finally {
    db.close();
  }
}
