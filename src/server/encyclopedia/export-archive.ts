import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { ZipFile } from "yazl";
import { originalPath } from "./database.ts";
import { exportDatabase } from "./export-database.ts";
import type { EncyclopediaPaths } from "./config.ts";
import type { TaskFilterState } from "../../types/encyclopedia.ts";

export interface ExportArchive {
  file: string;
  filename: string;
  count: number;
  cleanup: () => Promise<void>;
}

async function verifyFile(file: string, expectedHash: string, expectedSize: number, compressed: boolean, signal: AbortSignal) {
  const digest = createHash("sha256");
  let size = 0;
  const input = fs.createReadStream(file);
  async function consume(source: AsyncIterable<Buffer>) {
    for await (const bytes of source) {
      size += bytes.length;
      digest.update(bytes);
    }
  }
  if (compressed) await pipeline(input, createGunzip(), consume, { signal });
  else await pipeline(input, consume, { signal });
  if (size !== expectedSize || digest.digest("hex") !== expectedHash)
    throw new Error("附件长度或 SHA-256 校验失败：" + path.basename(file));
}

export async function createCompletedArchive(
  config: EncyclopediaPaths,
  readStates: () => Map<number, TaskFilterState>,
  signal: AbortSignal,
): Promise<ExportArchive> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "encyclopedia-export-"));
  async function cleanup() {
    // 只清理本次 mkdtemp 创建的目录。
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("encyclopedia-export-"))
      throw new Error("导出临时目录不合法。");
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  try {
    signal.throwIfAborted();
    const databaseRelative = "data/encyclopedia-workspace/encyclopedia.db";
    const database = path.join(directory, databaseRelative);
    await fs.promises.mkdir(path.dirname(database), { recursive: true });
    const ids = await exportDatabase(config, database, readStates, signal);
    const files = new Set<string>([databaseRelative]);
    const collected = new Map<string, string>();
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      async function collect(root: string, relative: string, prefix: string, sha256: string, size: number, compressed: boolean) {
        signal.throwIfAborted();
        const normalized = relative.replace(/\\/g, "/");
        const archivePath = prefix + normalized;
        const identity = JSON.stringify([sha256, size, compressed]);
        if (files.has(archivePath)) {
          if (collected.get(archivePath) !== identity) throw new Error("附件路径与其他导出文件冲突：" + normalized);
          return;
        }
        const source = originalPath({ ...config, dataRoot: root }, normalized);
        const destination = path.join(directory, archivePath);
        try {
          if (!(await fs.promises.stat(source)).isFile()) throw new Error("不是普通文件");
          await fs.promises.mkdir(path.dirname(destination), { recursive: true });
          await pipeline(fs.createReadStream(source), fs.createWriteStream(destination), { signal });
          await verifyFile(destination, sha256, size, compressed, signal);
        } catch (error) {
          signal.throwIfAborted();
          throw new Error("无法完整打包附件 " + normalized + "：" + (error instanceof Error ? error.message : String(error)));
        }
        files.add(archivePath);
        collected.set(archivePath, identity);
      }
      for (const row of db.prepare("SELECT blob_path,sha256,size FROM wiki_original_documents").all()) {
        const relative = String(row.blob_path);
        await collect(config.dataRoot, relative, "data/", String(row.sha256), Number(row.size), relative.endsWith(".gz"));
      }
      for (const row of db.prepare("SELECT * FROM wiki_media_assets").iterate()) {
        if (row.relative_path) {
          await collect(path.join(path.dirname(config.database), "assets"), String(row.relative_path),
            "data/encyclopedia-workspace/assets/", String(row.sha256), Number(row.size_bytes), false);
        } else {
          // 旧版图片直接存储为 BLOB，随数据库完整保留。
          const bytes = row.bytes as Uint8Array;
          if (createHash("sha256").update(bytes).digest("hex") !== row.sha256)
            throw new Error("数据库内嵌图片校验失败：" + row.sha256);
        }
      }
    } finally {
      db.close();
    }
    const manifest = {
      exportedAt: new Date().toISOString(),
      selection: "已完成：所有可处理字段均已检查，含暂无法确认的字段。",
      entryCount: ids.length,
      entryIds: ids,
      database: databaseRelative,
      files: [...files].sort(),
    };
    const readme = [
      "百科已完成词条导出", "",
      "词条数量：" + ids.length,
      "数据库：" + databaseRelative,
      "原件位于 data/ 下，图片位于 data/encyclopedia-workspace/assets/ 下。",
      "请完整解压并保留目录结构，以便按数据库中的相对路径读取附件。",
      "数据库保留主库的表、字段、索引、视图、触发器、字段字典与原始 ID。",
      "只包含导出时已完成且未删除的词条；跨词条关系仅保留两端均在导出库中的记录。",
      "未绑定的采集输入、候选导入批次及整库运行报告不随词条导出。",
      "已完成表示所有可处理字段已检查，不代表字段全部有值或全部获得确认。",
      "外部网站链接保持原样；仅打包数据库关联的本地原件和图片。",
      "主库的审核状态、可见性和维护库标记保持原样。",
      "导出清单见 manifest.json。", "",
    ].join("\n");
    const zip = new ZipFile();
    const file = path.join(directory, "completed.zip");
    const output = zip.outputStream as Readable;
    const readers = new Set<fs.ReadStream>();
    zip.on("error", function failed(error) { output.destroy(error); });
    const writing = pipeline(output, fs.createWriteStream(file), { signal });
    // 先挂接 rejection handler，防止压缩期间中断产生未处理的拒绝。
    void writing.catch(function handled() {});
    try {
      for (const relative of files) {
        zip.addReadStreamLazy(relative, function open(callback) {
          if (signal.aborted) { callback(new Error("导出已取消。"), null!); return; }
          const reader = fs.createReadStream(path.join(directory, relative));
          readers.add(reader);
          reader.once("close", function closed() { readers.delete(reader); });
          reader.on("error", function failed(error) { zip.emit("error", error); });
          callback(null, reader);
        });
      }
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), "manifest.json");
      zip.addBuffer(Buffer.from(readme), "README.txt");
      zip.end();
      await writing;
    } catch (error) {
      zip.emit("error", error);
      const closing: Promise<void>[] = [];
      for (const reader of readers) {
        closing.push(new Promise(function waitForClose(resolve) { reader.once("close", resolve); }));
        reader.destroy();
      }
      await Promise.all(closing);
      await writing.catch(function handled() {});
      throw error;
    }
    signal.throwIfAborted();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return { file, filename: "encyclopedia-completed-" + timestamp + ".zip", count: ids.length, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
