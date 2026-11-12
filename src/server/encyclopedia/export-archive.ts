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
  originalsIncluded: boolean;
  cleanup: () => Promise<void>;
}

export interface ExportArchiveOptions {
  includeOriginals: boolean;
}

const originalsOmittedKey = "encyclopedia.display-export.originals-omitted";

function systemConfigColumns(db: DatabaseSync): string[] {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_config'")
    .get();
  if (!table) return [];
  return db.prepare("PRAGMA table_info(system_config)").all().map(function name(row) {
    return String(row.name);
  });
}

function readOriginalsOmitted(database: string): boolean {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const columns = systemConfigColumns(db);
    if (!columns.includes("config_key") || !columns.includes("config_value")) return false;
    const row = db
      .prepare("SELECT config_value FROM system_config WHERE config_key=?")
      .get(originalsOmittedKey);
    return row ? String(row.config_value) === "true" : false;
  } finally {
    db.close();
  }
}

function markOriginalsOmitted(database: string) {
  const db = new DatabaseSync(database);
  try {
    const columns = systemConfigColumns(db);
    if (!columns.includes("config_key") || !columns.includes("config_value") || !columns.includes("description"))
      throw new Error("导出数据库没有可用的 system_config，无法标记网页展示库。");
    db.prepare(`INSERT INTO system_config(config_key,config_value,description) VALUES(?,?,?)
      ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,
      description=excluded.description,updated_at=datetime('now')`)
      .run(originalsOmittedKey, "true", "此库为网页展示库，原始资料实体未随数据库导出。");
  } finally {
    db.close();
  }
}

function migrationGuide(entryIds: number[], includeOriginals: boolean) {
  return [
    "# 百科数据库迁移指南",
    "",
    "> 这是一份与 `long-task-guard-web` 同结构的已完成词条导出包。请把本文件和整个 ZIP 一起交给 AI，并明确要求它在目标工程中执行迁移。",
    "",
    includeOriginals
      ? "> 本包包含数据库引用的全部原始资料，适合继续采集、证据复核和长期维护。"
      : "> 本包是网页展示库，未包含 `data/encyclopedia-sources/` 中的原始资料。适合浏览和展示，不能用于继续采集或再次生成完整维护库。",
    "",
    "## 给 AI 的任务",
    "",
    "请将本导出包中的百科数据迁移到当前工程。当前工程与导出工程使用相同的目录结构和数据库结构。先阅读本指南、`manifest.json` 和 `README.txt`，检查当前工程路径，再执行下面的步骤；不要猜测表结构，也不要把导出包中的文件提交到 Git。",
    "",
    "## 必须遵守的步骤",
    "",
    "1. 确认目标百科工程与数据库版本兼容，并完整解压到独立的临时目录。读取目标工程的数据库配置定位实际 dataRoot 和 database；发送方数据位于 FusionNexus/portal/data，不一定在 long-task-guard-web 根目录。若使用工作台，检查 src/server/encyclopedia/config.ts 的 dataRoot、database 和 workspace，按目标机器实际路径配置，不照抄发送方绝对路径。",
    "2. 停止 Next.js、百科后台任务服务和页面摘要服务，确保没有进程正在打开目标数据库。不要在服务运行时替换 SQLite 文件。",
    "3. 读取 `manifest.json`，确认 `database` 指向 `data/encyclopedia-workspace/encyclopedia.db`，核对 `originalsIncluded`，并记录导出词条数量和 ID。此次导出包含 " + entryIds.length + " 个已完成词条。",
    "4. 本流程用于首次安装。目标已有业务数据时，先报告冲突，由用户决定合并还是替换。修改前备份配置和将覆盖的文件，记录备份位置；已有 SQLite 库应使用一致备份，包含尚存的 -wal/-shm 状态。关闭连接后再处理旧库及其伴随文件，新库旁不能遗留旧库的 WAL/SHM。",
    "5. 按 manifest.json.files 安装数据：去掉每个路径开头的 data/，复制到已确认的 dataRoot 下；数据库位置应与目标 database 配置一致。保持附件相对路径，只处理清单所列文件，保留目标工程其他内容。同名文件有冲突时先核对，不能直接覆盖。",
    "6. 使用 SQLite 执行 `PRAGMA integrity_check;` 和 `PRAGMA foreign_key_check;`。检查 `entities` 的 ID 与 `manifest.json` 的 `entryIds` 一致，检查 `manifest.json` 中列出的文件都存在。任一检查失败都要停止，不要启动服务。",
    "7. 如果使用工作台，为新库配置独立的任务 workspace，避免将旧库任务按相同 ID 套用到新库；保留原有 panel/state.sqlite。若版本支持，在工作台根目录执行 npm run views:build 重建页面摘要。新工作目录没有任务历史，导入词条可能显示为未开始，这不表示数据库内容丢失。",
    "8. 按目标工程现有方式启动服务，打开百科页面验证" +
      (includeOriginals ? "词条、字段、证据、原件和图片均可读取。" : "词条、字段、证据文字和外置图片均可读取；原件实体按预期不存在，不要误报为数据损坏。") +
      "最后报告备份位置、导入数量、校验结果和仍需人工确认的问题。",
    "",
    "## 数据边界",
    "",
    "- 数据库保留原始词条 ID、字段字典、字段值、证据、修订、索引、视图和触发器；跨词条关系只保留导出库中两端都存在的关系。",
    includeOriginals
      ? "- `data/encyclopedia-sources/` 中是数据库引用的原件，`data/encyclopedia-workspace/assets/` 中是数据库引用的外置图片；数据库内嵌图片仍在数据库中。相对路径必须保持不变。"
      : "- 数据库仍保留原件的路径、大小和 SHA-256 记录，但 `data/encyclopedia-sources/` 中的实体文件未打包；外置图片仍位于 `data/encyclopedia-workspace/assets/`，相对路径必须保持不变。",
    "- 本导出包不包含目标工程的源代码、模型设置、Codex 会话、任务队列、执行日志或 `panel/state.sqlite`。不要伪造任务完成记录或自动启动采集。本包是维护库，审核状态与可见性保持原样；公开页面可能按发布状态过滤，不要自动批量发布。",
    "- 导出只包含导出开始时已完成且未删除的词条。已完成表示所有可处理字段均已检查，不代表所有字段都有值或都已确认。",
    "- 目标工程已有数据时不要直接合并或覆盖而不留备份。若用户要求合并，先停止并说明需要制定 ID、关系和附件冲突处理方案。",
    "",
    "## 出错处理",
    "",
    "任何路径、结构、完整性、附件或数量校验失败时，停止迁移并保留备份，不要运行 schema migration、不要删除原数据库、不要启动后台任务。向用户报告具体失败文件和命令输出。",
    "",
    "## 本次导出摘要",
    "",
    "- 导出类型：" + (includeOriginals ? "完整维护库（包含原始资料）" : "网页展示库（不包含原始资料）"),
    "- 词条数量：" + entryIds.length,
    "- 词条 ID：" + entryIds.join(", "),
    "- 数据库路径：`data/encyclopedia-workspace/encyclopedia.db`",
    "- 原件目录：`data/encyclopedia-sources/`",
    "- 外置图片目录：`data/encyclopedia-workspace/assets/`",
    "",
  ].join("\n");
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
  options: ExportArchiveOptions = { includeOriginals: false },
): Promise<ExportArchive> {
  const includeOriginals = options.includeOriginals;
  signal.throwIfAborted();
  // 展示库仍保留原件索引，但没有实体文件；完整导出必须在这里提前给出明确提示。
  if (includeOriginals && readOriginalsOmitted(config.database))
    throw new Error("当前数据库是网页展示库，原始资料已被省略；请从完整维护库重新导出。");
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
    // 标记写入导出副本，源数据库保持不变；以后对这个库做完整导出时可以立即识别。
    if (!includeOriginals) markOriginalsOmitted(database);
    const files = new Set<string>([databaseRelative]);
    const collected = new Map<string, string>();
    let originalCount = 0;
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
      originalCount = Number(
        db.prepare("SELECT COUNT(*) AS total FROM wiki_original_documents").get()?.total || 0,
      );
      const originalRows = includeOriginals
        ? db.prepare("SELECT blob_path,sha256,size FROM wiki_original_documents").all()
        : [];
      for (const row of originalRows) {
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
      originalsIncluded: includeOriginals,
      omittedOriginalCount: includeOriginals ? 0 : originalCount,
      files: [...files].sort(),
    };
    const readme = [
      "百科已完成词条导出", "",
      "导出类型：" + (includeOriginals ? "完整维护库" : "网页展示库（不含原始资料）"),
      "词条数量：" + ids.length,
      "数据库：" + databaseRelative,
      includeOriginals
        ? "原件位于 data/ 下，图片位于 data/encyclopedia-workspace/assets/ 下。"
        : "未打包 data/encyclopedia-sources/ 中的原件；图片仍位于 data/encyclopedia-workspace/assets/ 下。",
      "请完整解压并保留目录结构，以便按数据库中的相对路径读取附件。",
      "数据库保留主库的表、字段、索引、视图、触发器、字段字典与原始 ID。",
      "只包含导出时已完成且未删除的词条；跨词条关系仅保留两端均在导出库中的记录。",
      "未绑定的采集输入、候选导入批次及整库运行报告不随词条导出。",
      "已完成表示所有可处理字段已检查，不代表字段全部有值或全部获得确认。",
      "外部网站链接保持原样；" +
        (includeOriginals ? "仅打包数据库关联的本地原件和图片。" : "仅打包数据库关联的外置图片，不打包本地原件。"),
      "主库的审核状态、可见性和维护库标记保持原样。",
      "导出清单见 manifest.json；同结构工程迁移步骤见 迁移指南.md。",
      "迁移指南要求先停止服务、备份目标数据，再替换百科数据库和关联附件。",
      includeOriginals
        ? "本包可用于继续采集、原件复核和再次生成完整维护库。"
        : "数据库仍保留原件索引，但原件实体缺失；本包不可用于继续采集或再次生成完整维护库。", "",
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
      zip.addBuffer(Buffer.from(migrationGuide(ids, includeOriginals)), "迁移指南.md");
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
    const filename = (includeOriginals ? "encyclopedia-completed-" : "encyclopedia-display-") + timestamp + ".zip";
    return { file, filename, count: ids.length, originalsIncluded: includeOriginals, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
