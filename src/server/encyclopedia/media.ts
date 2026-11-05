import fs from "node:fs";
import path from "node:path";
import { openDatabase, originalPath, hash } from "./database.ts";
import type { EncyclopediaPaths } from "./config.ts";

export function readEntryImage(
  config: EncyclopediaPaths,
  id: number,
  sha256: string,
) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("图片标识不合法。");
  const db = openDatabase(config);
  try {
    const row = db
      .prepare(
        "SELECT a.* FROM wiki_media_assets a JOIN wiki_entry_media m ON m.sha256=a.sha256 JOIN entities e ON e.id=m.entity_id WHERE m.entity_id=? AND a.sha256=? AND e.deleted_at IS NULL",
      )
      .get(id, sha256);
    if (
      !row ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        String(row.mime_type),
      )
    )
      throw new Error("图片不存在。");
    let bytes: Uint8Array;
    if (row.relative_path) {
      const file = originalPath(
        {
          ...config,
          dataRoot: path.join(path.dirname(config.database), "assets"),
        },
        String(row.relative_path),
      );
      if (fs.statSync(file).size > 20 * 1024 * 1024)
        throw new Error("图片过大。");
      bytes = fs.readFileSync(file);
    } else bytes = row.bytes as Uint8Array;
    if (hash(Buffer.from(bytes)) !== sha256) throw new Error("图片校验失败。");
    return { bytes, mime: String(row.mime_type) };
  } finally {
    db.close();
  }
}
