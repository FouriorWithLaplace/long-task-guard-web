import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { EntryTask, FieldResult } from "../../types/encyclopedia.ts";
import { panelDirectory } from "./config.ts";
import type { EncyclopediaPaths } from "./config.ts";

export interface WriteIntent {
  id: string;
  entityId: number;
  runId: string;
  field: string;
  expectedVersion: number;
  result: FieldResult;
  before: Record<string, unknown>;
  status: "prepared" | "confirmed" | "not_committed" | "conflict";
  auditFingerprint?: string;
  error?: string;
}

// 每词条只保留当前任务和最新字段结果；写入核对记录独立于会话。
export class TaskStore {
  private db: DatabaseSync;
  constructor(config: EncyclopediaPaths) {
    const directory = panelDirectory(config);
    fs.mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "state.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks(entity_id INTEGER PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY,entity_id INTEGER NOT NULL,status TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,entity_id INTEGER NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS service_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  }
  get(id: number): EntryTask | null {
    const row = this.db
      .prepare("SELECT body FROM tasks WHERE entity_id=?")
      .get(id);
    return row ? JSON.parse(String(row.body)) : null;
  }
  list(): EntryTask[] {
    return this.db
      .prepare("SELECT body FROM tasks ORDER BY entity_id")
      .all()
      .map(function task(row) {
        return JSON.parse(String(row.body));
      });
  }
  phases(): Map<number, EntryTask["phase"]> {
    const rows = this.db
      .prepare(
        "SELECT entity_id, json_extract(body, '$.phase') phase FROM tasks",
      )
      .all();
    const phases = new Map<number, EntryTask["phase"]>();
    for (const row of rows)
      phases.set(Number(row.entity_id), row.phase as EntryTask["phase"]);
    return phases;
  }
  removeTask(id: number) {
    this.db.prepare("DELETE FROM tasks WHERE entity_id=?").run(id);
  }
  save(task: EntryTask, event?: string) {
    task.updatedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO tasks VALUES(?,?) ON CONFLICT(entity_id) DO UPDATE SET body=excluded.body",
        )
        .run(task.entityId, JSON.stringify(task));
      if (event)
        this.db
          .prepare(
            "INSERT INTO events(entity_id,event,detail,created_at) VALUES(?,?,?,?)",
          )
          .run(task.entityId, event, task.message, task.updatedAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  // 取得服务租约后迁移；合并最新字段结果与删除快照在同一事务中完成。
  migrateTasks() {
    const hasRounds = this.db.prepare("SELECT name FROM sqlite_master WHERE name='rounds'").get();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const current of this.list()) {
        const legacy = current as EntryTask & {
          round?: number;
          completedRounds?: number;
          roundStartedAt?: string;
        };
        if (legacy.round === undefined) continue;
        const results: EntryTask["results"] = {};
        if (hasRounds) {
          const rows = this.db.prepare("SELECT body FROM rounds WHERE entity_id=? ORDER BY rowid").all(current.entityId);
          for (const row of rows) {
            const old = JSON.parse(String(row.body)) as EntryTask;
            Object.assign(results, old.results);
          }
        }
        Object.assign(results, current.results);
        legacy.results = results;
        legacy.processedFields = Object.keys(results).filter(function confirmed(key) {
          return results[key].readback;
        });
        legacy.mode = "continue";
        legacy.filled = 0;
        legacy.slotHeld = current.desired === "running" && current.phase !== "queued";
        legacy.startedAt = legacy.roundStartedAt || current.updatedAt;
        legacy.queuedAt = legacy.startedAt;
        delete legacy.round;
        delete legacy.completedRounds;
        delete legacy.roundStartedAt;
        // 旧会话注册的是旧工具；恢复时创建使用新协议的会话。
        if (legacy.sessionId) {
          legacy.cleanupSessions.push(legacy.sessionId);
          legacy.sessionId = null;
        }
        legacy.skillHash = "";
        this.db.prepare("UPDATE tasks SET body=? WHERE entity_id=?")
          .run(JSON.stringify(legacy), legacy.entityId);
      }
      for (const current of this.list()) {
        const legacy = current as Omit<EntryTask, "phase" | "desired"> & {
          phase: string;
          desired: string;
        };
        if (legacy.desired !== "paused" && legacy.phase !== "paused" && legacy.phase !== "pausing") continue;
        legacy.desired = "stopped";
        legacy.phase = "stopped";
        legacy.slotHeld = false;
        legacy.nextRetryAt = null;
        legacy.generation++;
        if (legacy.sessionId) {
          if (!legacy.cleanupSessions.includes(legacy.sessionId)) legacy.cleanupSessions.push(legacy.sessionId);
          legacy.sessionId = null;
        }
        legacy.message = "旧任务已转为停止，已处理字段保留；点击开始可继续。";
        this.db.prepare("UPDATE tasks SET body=? WHERE entity_id=?")
          .run(JSON.stringify(legacy), legacy.entityId);
      }
      if (hasRounds) this.db.exec("DROP TABLE rounds");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  history(id: number) {
    const events = this.db
      .prepare(
        "SELECT event,detail,created_at FROM events WHERE entity_id=? ORDER BY id DESC LIMIT 60",
      )
      .all(id);
    return { events };
  }
  saveIntent(intent: WriteIntent) {
    this.db
      .prepare(
        "INSERT INTO intents VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,body=excluded.body",
      )
      .run(intent.id, intent.entityId, intent.status, JSON.stringify(intent));
  }
  intents(entityId: number, pendingOnly = true): WriteIntent[] {
    const filter = pendingOnly ? " AND status IN ('prepared','conflict')" : "";
    return this.db
      .prepare(
        "SELECT body FROM intents WHERE entity_id=?" +
          filter +
          " ORDER BY rowid",
      )
      .all(entityId)
      .map(function intent(row) {
        return JSON.parse(String(row.body));
      });
  }
  claimService(owner: string, now = Date.now()) {
    this.db
      .prepare(
        "INSERT INTO service_lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE service_lease.owner=excluded.owner OR service_lease.expires_at<?",
      )
      .run(owner, now + 30000, now);
    return (
      this.db.prepare("SELECT owner FROM service_lease WHERE id=1").get()
        ?.owner === owner
    );
  }
  releaseService(owner: string) {
    this.db
      .prepare("UPDATE service_lease SET expires_at=0 WHERE id=1 AND owner=?")
      .run(owner);
  }
  close() {
    this.db.close();
  }
}
