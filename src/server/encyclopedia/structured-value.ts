import type { Json } from "../../types/encyclopedia.ts";
import { randomUUID } from "node:crypto";

function validDate(value: Json | undefined): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)) return false;
  const [year, month = 1, day = 1] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function record(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("此字段的每条记录必须是 JSON 对象。");
  return value;
}

// Only the requested device structures have fixed shapes. Scientific content stays free JSON.
export function normalizeStructuredValue(
  type: string,
  field: string,
  value: Json,
): Json {
  if (type === 'org' && field === 'fields.organization_category') {
    if (!['enterprise_research','investment','public'].includes(String(value))) throw new Error('机构大类必须为企业与科研机构、投资机构或公共机构的约定值。');
    return value;
  }
  if (!['device','org'].includes(type)) return value;
  if (field === "fields.timeline" || type === 'org' && field === 'fields.investment_timeline') {
    if (!Array.isArray(value)) throw new Error("时间轴必须是 JSON 数组。");
    const ids = new Set<string>();
    const events = value.map(function normalizeEvent(item) {
      const row = { ...record(item) };
      if (!validDate(row.date))
        throw new Error(
          "时间轴日期使用 YYYY、YYYY-MM、YYYY-MM-DD；未知日期使用 null。",
        );
      for (const key of ["end_date", "published_date"])
        if (key in row && !validDate(row[key])) throw new Error(key + " 日期不合法。");
      if (typeof row.end_date === "string" && typeof row.date === "string" && row.end_date.slice(0, row.date.length) < row.date.slice(0, row.end_date.length))
        throw new Error("结束日期不能早于开始日期。");
      if (row.state !== undefined && !["planned", "occurred", "unknown"].includes(String(row.state)))
        throw new Error("state 必须为 planned、occurred 或 unknown。");
      if (row.id === undefined || row.id === null || row.id === "") row.id = randomUUID();
      if (typeof row.id !== "string" || ids.has(row.id)) throw new Error("时间轴 id 必须为不重复的文本。");
      ids.add(row.id);
      for (const key of ["title", "kind", "description"])
        if (typeof row[key] !== "string")
          throw new Error("时间轴记录需包含 title、kind、description 文本。");
      if (type === 'org') {
        const kinds=['founding','research','product','funding','investment','partnership','team','policy','award','restructuring','other'];
        if (!kinds.includes(String(row.kind))) throw new Error('机构时间轴事件类型不合法。');
        if (field === 'fields.investment_timeline' && row.kind !== 'investment') throw new Error('已投资项目时间轴必须使用 investment 类型。');
        if (typeof row.source_url !== 'string' || !/^https?:\/\//i.test(row.source_url)) throw new Error('机构事件需保留公开来源 URL。');
      }
      return row;
    });
    return events.sort(function chronological(left, right) {
      const a = record(left).date,
        b = record(right).date;
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return String(a).localeCompare(String(b));
    });
  }
  if (field === "fields.systems") {
    if (!Array.isArray(value)) throw new Error("关键系统必须是 JSON 数组。");
    for (const item of value) {
      const row = record(item);
      if (
        typeof row.name !== "string" ||
        !row.name.trim() ||
        typeof row.description !== "string" ||
        !row.description.trim()
      )
        throw new Error(
          "每个关键系统必须包含 name（名字）与 description（说明）。",
        );
    }
  }
  if (field === "fields.components" && value !== null && !Array.isArray(value))
    throw new Error("零部件必须是 JSON 数组，数量不限。");
  if (field === "fields.gallery") {
    const gallery = record(value);
    if (!("cover" in gallery) || !Array.isArray(gallery.images))
      throw new Error(
        "图集必须包含 cover 与 images 数组；没有封面时 cover 为 null。",
      );
  }
  return value;
}
