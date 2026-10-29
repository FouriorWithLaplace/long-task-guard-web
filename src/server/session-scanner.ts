import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { SessionSummary } from "@/types/guard";

export interface DiscoveredSession extends SessionSummary {
  rolloutPath: string;
  updatedAt: number;
}

interface SqliteRow {
  [column: string]: unknown;
}

interface SqliteStatement {
  all(...parameters: unknown[]): SqliteRow[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface DatabaseSyncConstructor {
  new (filename: string, options?: { readOnly?: boolean }): SqliteDatabase;
}

// 直接从 Node.js 获取内置模块，避免 Turbopack 改写 require 引用。
const sqliteModule = process.getBuiltinModule("node:sqlite");

if (!sqliteModule) {
  throw new Error("当前 Node.js 不支持内置 SQLite，请使用 Node.js 24 或更新版本。");
}

const sqlite = sqliteModule as {
  DatabaseSync: DatabaseSyncConstructor;
};
const DatabaseSync = sqlite.DatabaseSync;

function getCodexDirectory(): string {
  const configuredDirectory = process.env.CODEX_HOME;

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  return path.join(os.homedir(), ".codex");
}

function getStateDatabaseFiles(codexDirectory: string): string[] {
  if (!fs.existsSync(codexDirectory)) {
    throw new Error(`找不到 Codex 数据目录：${codexDirectory}`);
  }

  const files = fs.readdirSync(codexDirectory);

  return files
    .filter((fileName) => /^state_\d+\.sqlite$/i.test(fileName))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/\d+/)?.[0] ?? 0);
      const rightNumber = Number(right.match(/\d+/)?.[0] ?? 0);

      return rightNumber - leftNumber;
    })
    .map((fileName) => path.join(codexDirectory, fileName));
}

function normalizeStoredPath(storedPath: string): string {
  let normalizedPath = storedPath.trim();

  if (normalizedPath.startsWith("\\\\?\\UNC\\")) {
    normalizedPath = `\\\\${normalizedPath.slice(8)}`;
  } else if (normalizedPath.startsWith("\\\\?\\")) {
    normalizedPath = normalizedPath.slice(4);
  }

  return path.normalize(normalizedPath);
}

function isExistingDirectory(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function readThreads(databasePath: string): DiscoveredSession[] {
  const database = new DatabaseSync(databasePath, { readOnly: true });

  try {
    const columns = database
      .prepare("PRAGMA table_info(threads)")
      .all()
      .map((row) => String(row.name));

    const requiredColumns = ["id", "title", "cwd", "rollout_path"];
    const missingColumn = requiredColumns.find(
      (column) => !columns.includes(column),
    );

    if (missingColumn) {
      throw new Error(`Codex 会话表缺少字段：${missingColumn}`);
    }

    const updatedColumn = columns.includes("updated_at")
      ? quoteIdentifier("updated_at")
      : "rowid";
    const archivedFilter = columns.includes("archived")
      ? `WHERE ${quoteIdentifier("archived")} = 0`
      : "";
    const rows = database
      .prepare(
        `SELECT ${quoteIdentifier("id")},
                ${quoteIdentifier("title")},
                ${quoteIdentifier("cwd")},
                ${quoteIdentifier("rollout_path")},
                ${updatedColumn} AS updated_at
           FROM ${quoteIdentifier("threads")}
           ${archivedFilter}
          ORDER BY updated_at DESC`,
      )
      .all();

    const sessions: DiscoveredSession[] = [];

    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      const title = String(row.title ?? "").trim() || "未命名会话";
      const projectPath = normalizeStoredPath(String(row.cwd ?? ""));
      const rolloutPath = normalizeStoredPath(String(row.rollout_path ?? ""));

      if (!id || !projectPath || !rolloutPath) {
        continue;
      }

      if (!isExistingDirectory(projectPath) || !isExistingFile(rolloutPath)) {
        continue;
      }

      sessions.push({
        id,
        title,
        projectPath,
        rolloutPath,
        updatedAt: Number(row.updated_at ?? 0),
      });
    }

    return sessions;
  } finally {
    database.close();
  }
}

export function scanSessions(): DiscoveredSession[] {
  const codexDirectory = getCodexDirectory();
  const databaseFiles = getStateDatabaseFiles(codexDirectory);

  if (databaseFiles.length === 0) {
    throw new Error(`找不到 Codex 会话数据库：${codexDirectory}`);
  }

  let lastError: unknown = null;

  for (const databasePath of databaseFiles) {
    try {
      return readThreads(databasePath);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "无法读取 Codex 会话数据库";

  throw new Error(message);
}

export function discoverSessions(): SessionSummary[] {
  const sessions = scanSessions();

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    projectPath: session.projectPath,
  }));
}
