import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StatementSync } from "node:sqlite";
import { categories, hasFieldValue, taskFilterGroup } from "../../types/encyclopedia.ts";
import type { Json } from "../../types/encyclopedia.ts";
import { completionRatio } from "../../types/entry-sort.ts";
import { identifier, openDatabase } from "./database.ts";
import type { EncyclopediaPaths } from "./config.ts";
import { TaskStore } from "./store.ts";
import { displayTask } from "./task-summary.ts";
import { atomicJson, entryBucket, PageViews, viewsDirectory } from "./page-views.ts";
import type { ViewIndexItem, ViewManifest, ViewRecord } from "./page-views.ts";

interface Definition { column_name: string; field_key: string; storage: string; collection_mode: string; }
interface FieldReader { definitions: Definition[]; statement: StatementSync | null; }

export class ViewBuilder {
  private config: EncyclopediaPaths;
  private db: ReturnType<typeof openDatabase>;
  private store: TaskStore;
  private views: PageViews;
  private manifest: ViewManifest | null = null;
  private fields = new Map<string, FieldReader>();
  private indexes = new Map<string, Map<number, ViewIndexItem>>();
  private buckets = new Map<string, Record<string, ViewRecord>>();
  private dirtyBuckets = new Set<string>();
  private dirtyCategories = new Set<string>();
  private running = new Set<number>();
  private identity: string;

  constructor(config: EncyclopediaPaths) {
    this.config = config;
    this.db = openDatabase(config, false);
    this.store = new TaskStore(config);
    this.views = new PageViews(config);
    const stat = fs.statSync(config.database);
    this.identity = stat.dev + ":" + stat.ino + ":" + stat.birthtimeMs;
    this.installTracking();
    try { this.manifest = this.views.manifest(); } catch { /* First build. */ }
    for (const category of categories) {
      let rows: ViewIndexItem[] = [];
      if (this.manifest) {
        try { rows = this.views.read<ViewIndexItem[]>("catalog/" + category.key + ".json"); }
        catch { this.manifest = null; }
      }
      this.indexes.set(category.key, new Map(rows.map(function pair(row) { return [row.id, row]; })));
    }
    if (this.manifest) {
      try {
        const tasks = this.views.read<{ id: number; active: boolean }[]>("task-index.json");
        for (const task of tasks) if (task.active) this.running.add(task.id);
      } catch { this.manifest = null; }
    }
  }
  private installTracking() {
    this.db.exec("CREATE TABLE IF NOT EXISTS panel_view_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,entity_id INTEGER NOT NULL)");
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const row of tables) {
      const table = String(row.name);
      const global = ["wiki_column_fields", "wiki_entry_types"].includes(table);
      const perEntry = ["entities", "wiki_entry_profiles", "wiki_column_value_types"].includes(table) || table.startsWith("wiki_type_");
      if (!global && !perEntry) continue;
      const key = table === "entities" ? "id" : "entity_id";
      for (const action of ["INSERT", "UPDATE", "DELETE"]) {
        const reference = action === "DELETE" ? "OLD" : "NEW";
        const id = global ? "0" : reference + "." + identifier(key);
        const name = identifier("panel_view_" + table + "_" + action.toLowerCase());
        this.db.exec("CREATE TRIGGER IF NOT EXISTS " + name + " AFTER " + action + " ON " + identifier(table) +
          " BEGIN INSERT INTO panel_view_changes(entity_id) VALUES(" + id + "); END");
      }
    }
  }
  private schemaVersion() {
    return Number(this.db.prepare("PRAGMA schema_version").get()!.schema_version);
  }
  private bucket(id: number) {
    const name = entryBucket(id);
    let records = this.buckets.get(name);
    if (!records) {
      try { records = this.views.read<Record<string, ViewRecord>>(name); }
      catch { records = {}; }
      this.buckets.set(name, records);
    }
    return records;
  }
  private category(type: string): string | null {
    for (const category of categories) if (category.types.includes(type)) return category.key;
    return ["code", "event"].includes(type) ? null : "entry";
  }
  private fieldReader(type: string): FieldReader {
    const cached = this.fields.get(type);
    if (cached) return cached;
    const definitions = this.db.prepare("SELECT column_name,field_key,storage,collection_mode FROM wiki_column_fields WHERE type_key=? ORDER BY storage,ordinal,field_key")
      .all(type).filter(function writable(row) {
        return row.storage !== "identity" && !["name", "entity_id"].includes(String(row.field_key)) &&
          !["system", "identity_review", "paused"].includes(String(row.collection_mode));
      }) as unknown as Definition[];
    const columns = [...new Set(definitions.map(function column(field) { return identifier(field.column_name); }))];
    const statement = columns.length ? this.db.prepare("SELECT " + columns.join(",") + " FROM " + identifier("wiki_type_" + type) + " WHERE entity_id=?") : null;
    const reader = { definitions, statement };
    this.fields.set(type, reader);
    return reader;
  }
  private sourceEntry(id: number): ViewRecord | null {
    const row = this.db.prepare(`SELECT e.id,e.name,e.name_en,p.type_key,p.state,p.version,t.name type_name
      FROM entities e JOIN wiki_entry_profiles p ON p.entity_id=e.id JOIN wiki_entry_types t ON t.key=p.type_key
      WHERE e.id=? AND e.deleted_at IS NULL`).get(id);
    if (!row || !this.category(String(row.type_key))) return null;
    const reader = this.fieldReader(String(row.type_key));
    const values = reader.statement?.get(id) || {};
    const types = new Map(this.db.prepare("SELECT column_name,json_type FROM wiki_column_value_types WHERE entity_id=?").all(id).map(function pair(item) {
      return [String(item.column_name), String(item.json_type)];
    }));
    let filled = 0;
    const fieldKeys: string[] = [];
    for (const field of reader.definitions) {
      let value = values[field.column_name] ?? null;
      const type = types.get(field.column_name);
      if (typeof value === "string" && type && type !== "text") value = JSON.parse(value);
      if (hasFieldValue(value as Json)) filled++;
      fieldKeys.push(field.storage + "." + field.field_key);
    }
    return { fieldKeys, entry: {
      id, name: String(row.name), nameEn: String(row.name_en || ""), type: String(row.type_key),
      typeName: String(row.type_name), state: String(row.state), version: Number(row.version),
      progress: { filled, checked: 0, total: fieldKeys.length, percent: 0 },
    } };
  }
  private update(id: number, sourceChanged: boolean) {
    const bucket = this.bucket(id);
    let record: ViewRecord | null = sourceChanged ? this.sourceEntry(id) : bucket[String(id)] || null;
    if (!record && !sourceChanged) record = this.sourceEntry(id);
    this.running.delete(id);
    if (!record) {
      for (const [key, index] of this.indexes) {
        if (index.delete(id)) this.dirtyCategories.add(key);
      }
      delete bucket[String(id)];
      this.dirtyBuckets.add(entryBucket(id));
      return;
    }
    const task = this.store.getSummary(id);
    const progress = record.entry.progress!;
    const confirmed = new Set(task?.processedFields || []);
    progress.checked = record.fieldKeys.filter(function checked(key) { return confirmed.has(key); }).length;
    progress.percent = progress.total ? Math.floor(progress.checked * 100 / progress.total) : 0;
    if (task) {
      const display = displayTask(task);
      display.displayProgress = { ...task.displayProgress!, ...progress };
      record.entry.task = display;
      if (taskFilterGroup(display) === "running") this.running.add(id);
    } else delete record.entry.task;
    const entry = record.entry;
    Object.assign(entry, { viewRevision: randomUUID() });
    const category = this.category(entry.type)!;
    const item = { id, name: entry.name, nameEn: entry.nameEn, state: entry.state, group: taskFilterGroup(task), completion: completionRatio(progress) };
    for (const [key, index] of this.indexes) {
      if (key !== category && index.delete(id)) this.dirtyCategories.add(key);
    }
    const index = this.indexes.get(category)!;
    if (JSON.stringify(index.get(id)) !== JSON.stringify(item)) {
      index.set(id, item);
      this.dirtyCategories.add(category);
    }
    bucket[String(id)] = record;
    this.dirtyBuckets.add(entryBucket(id));
  }
  sync(force = false) {
    let schema = this.schemaVersion();
    if (this.manifest && schema !== this.manifest.schemaVersion) {
      this.installTracking();
      schema = this.schemaVersion();
    }
    const mainChanges = this.db.prepare("SELECT seq,entity_id FROM panel_view_changes WHERE seq>? ORDER BY seq").all(this.manifest?.mainSequence || 0);
    const taskChanges = this.store.changes(this.manifest?.taskSequence || 0);
    // Capture the journal boundary first. External writes after this point are replayed next time.
    this.store.refreshChangedSummaries();
    const rebuild = force || !this.manifest || this.manifest.format !== 3 || this.manifest.databaseIdentity !== this.identity ||
      schema !== this.manifest.schemaVersion || mainChanges.some(function global(row) { return Number(row.entity_id) === 0; });
    const concurrency = this.store.getConcurrency();
    const settingsChanged = !this.manifest || this.views.home().concurrency !== concurrency;
    if (!rebuild && !mainChanges.length && !taskChanges.length && !settingsChanged) return { changed: 0, rebuilt: false };
    const mainSequence = Number(mainChanges.at(-1)?.seq || this.manifest?.mainSequence || 0);
    const taskSequence = Number(taskChanges.at(-1)?.seq || this.manifest?.taskSequence || 0);
    const sourceIds = new Set<number>();
    const ids = new Set<number>();
    if (rebuild) {
      this.fields.clear();
      for (const index of this.indexes.values()) for (const id of index.keys()) ids.add(id);
      for (const row of this.db.prepare("SELECT entity_id FROM wiki_entry_profiles ORDER BY entity_id").all()) ids.add(Number(row.entity_id));
      for (const category of categories) this.dirtyCategories.add(category.key);
    } else {
      for (const row of mainChanges) { ids.add(Number(row.entity_id)); sourceIds.add(Number(row.entity_id)); }
      for (const row of taskChanges) ids.add(Number(row.entity_id));
    }
    // Publish data first, then the manifest; unacknowledged journal rows survive a crash.
    for (const id of ids) this.update(id, rebuild || sourceIds.has(id));
    const directory = viewsDirectory(this.config);
    for (const name of this.dirtyBuckets) atomicJson(path.join(directory, name), this.buckets.get(name));
    for (const key of this.dirtyCategories) {
      const rows = [...this.indexes.get(key)!.values()].sort(function byId(a, b) { return a.id - b.id; });
      atomicJson(path.join(directory, "catalog", key + ".json"), rows);
    }
    const indexes = this.indexes;
    const categoryViews = categories.map(function categoryView(category) {
      const index = indexes.get(category.key)!;
      let excluded = 0;
      for (const item of index.values()) if (item.state === "excluded") excluded++;
      return { ...category, total: index.size, excluded };
    });
    this.writeSmall("home.json", { categories: categoryViews, workspace: this.config.workspace, concurrency, activeCount: this.running.size });
    // History is a separate file and is loaded only when the user opens that tab.
    const taskIndex = this.store.taskIndex().filter(function visible(task) {
      for (const index of indexes.values()) if (index.has(task.id)) return true;
      return false;
    });
    this.writeSmall("task-index.json", taskIndex);
    const manifest: ViewManifest = { format: 3, revision: randomUUID(), mainSequence, taskSequence, schemaVersion: schema, databaseIdentity: this.identity, updatedAt: new Date().toISOString() };
    atomicJson(path.join(directory, "manifest.json"), manifest);
    this.manifest = manifest;
    this.db.prepare("DELETE FROM panel_view_changes WHERE seq<=?").run(mainSequence);
    this.store.acknowledgeChanges(taskSequence);
    this.dirtyBuckets.clear();
    this.dirtyCategories.clear();
    this.buckets.clear();
    return { changed: ids.size, rebuilt: rebuild };
  }
  private writeSmall(name: string, value: unknown) {
    const file = path.join(viewsDirectory(this.config), name);
    const text = JSON.stringify(value);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
    atomicJson(file, value);
  }
  close() { this.store.close(); this.db.close(); }
}
