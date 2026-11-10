import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { EntryTask, FieldResult } from "../../types/encyclopedia.ts";
import { panelDirectory } from "./config.ts";
import type { EncyclopediaPaths } from "./config.ts";
import { summarizeTask } from "./task-summary.ts";
import { taskFilterGroup } from "../../types/encyclopedia.ts";
import type { TaskQueueIndex } from "../../types/task-queue.ts";

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
  private transactionActive = false;
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
    this.db.exec("CREATE TABLE IF NOT EXISTS panel_settings(key TEXT PRIMARY KEY,value INTEGER NOT NULL)");
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS intents_entity_status ON intents(entity_id,status);
      CREATE INDEX IF NOT EXISTS events_entity_id ON events(entity_id,id);
      CREATE TABLE IF NOT EXISTS task_summaries(entity_id INTEGER PRIMARY KEY,body TEXT NOT NULL,desired TEXT,phase TEXT,revision INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS task_summaries_desired ON task_summaries(desired);
      CREATE TABLE IF NOT EXISTS panel_task_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,entity_id INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS panel_task_changes_entity ON panel_task_changes(entity_id,seq);
      CREATE TRIGGER IF NOT EXISTS panel_task_insert AFTER INSERT ON tasks BEGIN
        INSERT INTO panel_task_changes(entity_id) VALUES(NEW.entity_id); END;
      CREATE TRIGGER IF NOT EXISTS panel_task_update AFTER UPDATE ON tasks BEGIN
        INSERT INTO panel_task_changes(entity_id) VALUES(NEW.entity_id); END;
      CREATE TRIGGER IF NOT EXISTS panel_task_delete AFTER DELETE ON tasks BEGIN
        INSERT INTO panel_task_changes(entity_id) VALUES(OLD.entity_id); END;
    `);
    // One-time migration, one task at a time: never allocate the entire legacy body set.
    const missing = this.db.prepare("SELECT entity_id FROM tasks WHERE entity_id NOT IN (SELECT entity_id FROM task_summaries)").all();
    for (const row of missing) this.refreshSummary(Number(row.entity_id));
  }
  private writeSummary(task: EntryTask) {
    const revision = Number(this.db.prepare("SELECT max(seq) n FROM panel_task_changes WHERE entity_id=?").get(task.entityId)?.n || 0);
    this.db.prepare("INSERT INTO task_summaries VALUES(?,?,?,?,?) ON CONFLICT(entity_id) DO UPDATE SET body=excluded.body,desired=excluded.desired,phase=excluded.phase,revision=excluded.revision")
      .run(task.entityId, JSON.stringify(summarizeTask(task)), task.desired, task.phase, revision);
  }
  refreshSummary(id: number) {
    // The transaction also covers external writes observed by the projection worker.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const task = this.get(id);
      if (task) this.writeSummary(task);
      else this.db.prepare("DELETE FROM task_summaries WHERE entity_id=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  getSummary(id: number): EntryTask | null {
    const row = this.db.prepare("SELECT body FROM task_summaries WHERE entity_id=?").get(id);
    return row ? JSON.parse(String(row.body)) : null;
  }
  listSummaries(runningOnly = false): EntryTask[] {
    const where = runningOnly ? " WHERE desired='running'" : "";
    return this.db.prepare("SELECT body FROM task_summaries" + where + " ORDER BY entity_id").all().map(function parse(row) {
      return JSON.parse(String(row.body));
    });
  }
  taskIndex(): TaskQueueIndex[] {
    return this.db.prepare(`SELECT entity_id,phase,desired,
      json_extract(body,'$.queuedAt') queued_at,
      json_extract(body,'$.queueOrder') queue_order,
      json_extract(body,'$.slotHeld') slot_held,
      json_extract(body,'$.nextRetryAt') next_retry_at
      FROM task_summaries ORDER BY entity_id`).all().map(function item(row) {
      const state = { phase: row.phase as EntryTask["phase"], desired: row.desired as EntryTask["desired"] };
      const id = Number(row.entity_id);
      return { id, active: taskFilterGroup(state) === "running", queue: {
        entityId: id, ...state, queuedAt: String(row.queued_at || ""), queueOrder: Number(row.queue_order || 0),
        slotHeld: row.slot_held === 1, nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
      } };
    });
  }
  refreshChangedSummaries() {
    const rows = this.db.prepare(`SELECT c.entity_id, max(c.seq) seq FROM panel_task_changes c
      LEFT JOIN task_summaries s ON s.entity_id=c.entity_id
      GROUP BY c.entity_id HAVING max(c.seq)>coalesce(s.revision,-1)`).all();
    for (const row of rows) this.refreshSummary(Number(row.entity_id));
  }
  changes(after: number) {
    return this.db.prepare("SELECT seq,entity_id FROM panel_task_changes WHERE seq>? ORDER BY seq").all(after) as { seq: number; entity_id: number }[];
  }
  acknowledgeChanges(through: number) {
    this.db.prepare("DELETE FROM panel_task_changes WHERE seq<=?").run(through);
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
        "SELECT entity_id, phase FROM task_summaries",
      )
      .all();
    const phases = new Map<number, EntryTask["phase"]>();
    for (const row of rows)
      phases.set(Number(row.entity_id), row.phase as EntryTask["phase"]);
    return phases;
  }
  removeTask(id: number) {
    this.db.prepare("DELETE FROM tasks WHERE entity_id=?").run(id);
    this.db.prepare("DELETE FROM task_summaries WHERE entity_id=?").run(id);
  }
  // 回调必须同步完成；批量写入只提交一次，不能跨 await 持有事务。
  transaction<T>(operation: () => T): T {
    if (this.transactionActive) {
      // 单项失败只撤销这一项；整批仍由外层事务一次落盘。
      this.db.exec("SAVEPOINT task_write");
      try {
        const result = operation();
        this.db.exec("RELEASE task_write");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK TO task_write; RELEASE task_write");
        throw error;
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    this.transactionActive = true;
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionActive = false;
    }
  }
  getConcurrency(): number {
    return Number(this.db.prepare("SELECT value FROM panel_settings WHERE key='concurrency'").get()?.value || 2);
  }
  setConcurrency(value: number) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("同时执行数量必须是大于 0 的整数。");
    this.db.prepare("INSERT INTO panel_settings VALUES('concurrency',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value);
  }
  hasPendingIntents(id: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM intents WHERE entity_id=? AND status IN ('prepared','conflict') LIMIT 1").get(id);
  }
  save(task: EntryTask, event?: string) {
    delete task.displayProgress;
    task.updatedAt = new Date().toISOString();
    this.transaction(this.writeTask.bind(this, task, event));
  }
  private writeTask(task: EntryTask, event?: string) {
    this.db
      .prepare(
        "INSERT INTO tasks VALUES(?,?) ON CONFLICT(entity_id) DO UPDATE SET body=excluded.body",
      )
      .run(task.entityId, JSON.stringify(task));
    this.writeSummary(task);
    if (event)
      this.db
        .prepare(
          "INSERT INTO events(entity_id,event,detail,created_at) VALUES(?,?,?,?)",
        )
        .run(task.entityId, event, task.message, task.updatedAt);
  }
  // 取得服务租约后迁移；合并最新字段结果与删除快照在同一事务中完成。
  migrateTasks() {
    const hasRounds = this.db.prepare("SELECT name FROM sqlite_master WHERE name='rounds'").get();
    const legacy = this.listSummaries().some(function needsMigration(task) {
      return "round" in task || ["paused", "pausing"].includes(task.phase) || String(task.desired) === "paused";
    });
    if (!hasRounds && !legacy) return;
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
      this.refreshChangedSummaries();
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
