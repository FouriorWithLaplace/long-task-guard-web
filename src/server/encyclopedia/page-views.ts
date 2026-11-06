import fs from "node:fs";
import path from "node:path";
import { categories, taskFilters } from "../../types/encyclopedia.ts";
import type { EntrySummary, EntryTask, TaskFilter } from "../../types/encyclopedia.ts";
import { panelDirectory } from "./config.ts";
import type { EncyclopediaPaths } from "./config.ts";
import { completionRatio, readEntrySort, readTaskSort } from "../../types/entry-sort.ts";
import type { EntrySort } from "../../types/entry-sort.ts";
import { compareExecutionOrder, queueState } from "../../types/task-queue.ts";
import type { TaskQueueIndex, QueueDisplay } from "../../types/task-queue.ts";

const nameOrder = new Intl.Collator("zh-CN-u-co-pinyin", { numeric: true, sensitivity: "base" });

export interface ViewIndexItem {
  id: number;
  name: string;
  nameEn: string;
  state: string;
  group: TaskFilter;
  completion?: number;
}
export interface ViewRecord {
  entry: EntrySummary;
  fieldKeys: string[];
}
export interface ViewManifest {
  format: number;
  revision: string;
  mainSequence: number;
  taskSequence: number;
  schemaVersion: number;
  databaseIdentity: string;
  updatedAt: string;
}
export interface HomeView {
  categories: (typeof categories[number] & { total: number; excluded: number })[];
  workspace: string;
  concurrency: number;
  activeCount: number;
}
export function viewsDirectory(config: EncyclopediaPaths) {
  return path.join(panelDirectory(config), "page-views");
}
export function entryBucket(id: number) {
  return "entries/" + Math.floor(id / 128) + ".json";
}
export function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  try {
    fs.writeFileSync(temporary, JSON.stringify(value));
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// The reader deliberately has no database imports. Requests cannot rebuild views.
export class PageViews {
  readonly directory: string;
  private cache = new Map<string, { stamp: string; value: unknown }>();
  private queries = new Map<string, { index: ViewIndexItem[]; matches: ViewIndexItem[] }>();
  constructor(config: EncyclopediaPaths) {
    this.directory = viewsDirectory(config);
  }
  read<T>(name: string): T {
    const file = path.join(this.directory, name);
    let stat: fs.Stats;
    try { stat = fs.statSync(file); }
    catch {
      throw Object.assign(new Error("页面数据正在准备，请稍后刷新。"), { status: 503 });
    }
    const stamp = stat.mtimeMs + ":" + stat.ctimeMs + ":" + stat.size;
    const cached = this.cache.get(name);
    if (cached?.stamp === stamp) return cached.value as T;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    // Keep only recently requested shards; browsing never retains the whole catalog.
    if (this.cache.size >= 96) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(name, { stamp, value });
    return value as T;
  }
  home() { return this.read<HomeView>("home.json"); }
  manifest() { return this.read<ViewManifest>("manifest.json"); }
  private sorted<T extends { id: number }>(items: T[], sort: EntrySort, index: Map<number, ViewIndexItem>): T[] {
    if (sort === "default") return items;
    // 旧版摘要尚未重建时按需读取轻量分片；新摘要的排序只读取索引。
    const keys = new Map<number, { name: string; completion: number }>();
    for (const item of items) {
      const record = index.get(item.id);
      let completion = record?.completion;
      if (sort === "progress" && completion === undefined) completion = completionRatio(this.entry(item.id)?.progress);
      keys.set(item.id, { name: record?.name || "", completion: completion || 0 });
    }
    return [...items].sort(function compare(a, b) {
      const left = keys.get(a.id)!;
      const right = keys.get(b.id)!;
      const difference = sort === "name"
        ? nameOrder.compare(left.name, right.name)
        : right.completion - left.completion;
      return difference || a.id - b.id;
    });
  }
  tasks(history: boolean, requestedPage = 1, idsOnly = false, category = "all", requestedSort = "default") {
    const sort = readTaskSort(requestedSort);
    if (category !== "all" && !categories.some(function valid(item) { return item.key === category; })) {
      throw new Error("不存在的分类。");
    }
    let index = this.read<TaskQueueIndex[]>("task-index.json");
    const queueDisplays = new Map<number, QueueDisplay>();
    if (sort === "execution") {
      const now = Date.now();
      const indexed: TaskQueueIndex[] = [];
      for (const item of index) {
        // 兼容更新器重建前的旧索引；新索引包含调度字段，无需读全部分片。
        const queue = item.queue || this.entry(item.id)?.task || {
          entityId: item.id, phase: "stopped" as const, desired: "stopped" as const,
          slotHeld: false, queuedAt: "", nextRetryAt: null,
        };
        indexed.push({ ...item, queue });
      }
      index = indexed;
      index.sort(function compare(a, b) { return compareExecutionOrder(a.queue!, b.queue!, now); });
      let position = 0;
      for (const item of index) {
        const state = queueState(item.queue!, now);
        if (state === "waiting") position++;
        queueDisplays.set(item.id, { state, position: state === "waiting" ? position : null });
      }
    }
    let categoryTasks = index;
    if (category !== "all") {
      // 使用已有分类索引，科学词条的子类型也按词条库的分类规则筛选。
      const entries = this.read<ViewIndexItem[]>("catalog/" + category + ".json");
      const ids = new Set(entries.map(function id(entry) { return entry.id; }));
      categoryTasks = index.filter(function inCategory(task) { return ids.has(task.id); });
    }
    const activeTasks = categoryTasks.filter(function active(item) { return item.active; });
    let matches = history ? categoryTasks : activeTasks;
    if (sort !== "default" && sort !== "execution") {
      const sortIndex = new Map<number, ViewIndexItem>();
      for (const item of categories) {
        if (category !== "all" && item.key !== category) continue;
        for (const entry of this.read<ViewIndexItem[]>("catalog/" + item.key + ".json")) {
          sortIndex.set(entry.id, entry);
        }
      }
      matches = this.sorted(matches, sort, sortIndex);
    }
    const filteredActiveCount = activeTasks.length;
    const totalTasks = categoryTasks.length;
    const pages = Math.max(1, Math.ceil(matches.length / 30));
    const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
    if (idsOnly) {
      return {
        tasks: [],
        total: matches.length,
        totalTasks,
        filteredActiveCount,
        page: 1,
        pages,
        concurrency: 2,
        ids: matches.map(function id(item) { return item.id; }),
      };
    }
    const tasks: EntryTask[] = [];
    for (const item of matches.slice((page - 1) * 30, page * 30)) {
      const task = this.entry(item.id)?.task;
      if (task) tasks.push(sort === "execution" ? { ...task, displayQueue: queueDisplays.get(item.id) } : task);
    }
    return { tasks, total: matches.length, totalTasks, filteredActiveCount, page, pages, concurrency: 2 };
  }
  entry(id: number): EntrySummary | null {
    const records = this.read<Record<string, ViewRecord>>(entryBucket(id));
    return records[String(id)]?.entry || null;
  }
  entries(category: string, query = "", requestedPage = 1, status = "all", idsOnly = false, requestedSort = "default") {
    const sort = readEntrySort(requestedSort);
    if (!categories.some(function valid(item) { return item.key === category; }))
      throw new Error("不存在的分类。");
    if (!taskFilters.some(function valid(item) { return item.value === status; }))
      throw new Error("未知的任务筛选条件。");
    const index = this.read<ViewIndexItem[]>("catalog/" + category + ".json");
    // Match SQLite LIKE's default ASCII folding; %, _ and backslash remain literals.
    function fold(text: string) { return text.replace(/[A-Z]/g, function lower(letter) { return letter.toLowerCase(); }); }
    const search = fold(query);
    const queryKey = JSON.stringify([category, query, status, sort]);
    const cachedQuery = this.queries.get(queryKey);
    let matches: ViewIndexItem[];
    if (cachedQuery?.index === index) matches = cachedQuery.matches;
    else {
      matches = !search && status === "all" ? index : index.filter(function match(item) {
        const matchesStatus = status === "all" || item.group === status;
        const matchesSearch = !search || String(item.id) === query || fold(item.name).includes(search) || fold(item.nameEn).includes(search);
        return matchesStatus && matchesSearch;
      });
      if (sort !== "default") {
        const sortIndex = new Map(index.map(function pair(item) { return [item.id, item] as const; }));
        matches = this.sorted(matches, sort, sortIndex);
      }
      if (this.queries.size >= 32) this.queries.delete(this.queries.keys().next().value!);
      this.queries.set(queryKey, { index, matches });
    }
    const total = matches.length;
    const pages = Math.max(1, Math.ceil(total / 30));
    const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
    if (idsOnly) return { entries: [], total, pages, page: 1, ids: matches.map(function id(item) { return item.id; }) };
    const entries: EntrySummary[] = [];
    for (const item of matches.slice((page - 1) * 30, page * 30)) {
      const entry = this.entry(item.id);
      if (entry) entries.push(entry);
    }
    return { entries, total, page, pages };
  }
}
