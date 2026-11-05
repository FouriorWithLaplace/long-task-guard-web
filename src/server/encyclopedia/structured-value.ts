import type { Json } from "../../types/encyclopedia.ts";

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
  if (type !== "device") return value;
  if (field === "fields.timeline") {
    if (!Array.isArray(value)) throw new Error("时间轴必须是 JSON 数组。");
    for (const item of value) {
      const row = record(item);
      if (
        row.date !== null &&
        (typeof row.date !== "string" ||
          !/^\d{4}(?:-(?:0[1-9]|1[0-2]))?(?:-(?:0[1-9]|[12]\d|3[01]))?$/.test(
            row.date,
          ))
      )
        throw new Error(
          "时间轴日期使用 YYYY、YYYY-MM、YYYY-MM-DD；未知日期使用 null。",
        );
      for (const key of ["title", "kind", "description"])
        if (typeof row[key] !== "string")
          throw new Error("时间轴记录需包含 title、kind、description 文本。");
    }
    return [...value].sort(function chronological(left, right) {
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
  if (field === "fields.component_suppliers" && !Array.isArray(value))
    throw new Error("零件供应商必须是 JSON 数组，数量不限。");
  if (field === "fields.gallery") {
    const gallery = record(value);
    if (!("cover" in gallery) || !Array.isArray(gallery.images))
      throw new Error(
        "图集必须包含 cover 与 images 数组；没有封面时 cover 为 null。",
      );
  }
  return value;
}
