"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  categories,
  fieldProgress,
  processedFieldKeys,
  hasFieldValue,
  taskProgress,
  taskFilters,
  taskFilterGroup,
} from "@/types/encyclopedia";
import type {
  EntryDetail,
  EntrySummary,
  EntryTask,
  BatchAction,
} from "@/types/encyclopedia";
import type { GuardSnapshot } from "@/types/guard";
import GuardTerminal from "./GuardTerminal";
import ModelSelector from "./ModelSelector";
import EncyclopediaBatch from "./EncyclopediaBatch";
import {EntryGalleryCover} from "./EncyclopediaContent";
import {
  CategoryIcon,
  FieldRow,
  TaskProgress,
  TaskStatus,
  displayValue,
  formatDate,
} from "./EncyclopediaDisplay";

type View =
  | { kind: "home" }
  | { kind: "category"; category: string }
  | { kind: "entry"; id: number }
  | { kind: "running" };
interface DetailResponse {
  entry: EntryDetail;
  task: EntryTask | null;
  history: {
    events: { event: string; detail: string; created_at: string }[];
  };
}
interface EntriesResponse {
  entries: EntrySummary[];
  total: number;
  page: number;
  pages: number;
}
interface HomeResponse {
  categories: ((typeof categories)[number] & {
    total: number;
    excluded: number;
  })[];
  workspace: string;
}
const activePhases = new Set([
  "queued",
  "starting",
  "running",
  "retrying",
  "stopping",
]);
async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "读取数据失败。");
  return body;
}

export default function EncyclopediaPanel({ view }: { view: View }) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [entries, setEntries] = useState<EntriesResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [tasks, setTasks] = useState<EntryTask[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStatus, setStatus] = useState("all");
  // 热更新可能保留已删除的筛选值，回退到“全部”后再请求列表。
  const status = taskFilters.some(function available(filter) {
    return filter.value === selectedStatus;
  }) ? selectedStatus : "all";
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [downloadingFields, setDownloadingFields] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const exportController = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState("all");
  const [fieldSearch, setFieldSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selection, setSelection] = useState({ model: "", reasoning: "" });
  const [connected, setConnected] = useState(false);
  const detailVersion = useRef("");
  const refreshVersion = useRef(0);
  const kind = view.kind;
  const categoryKey = view.kind === "category" ? view.category : "";
  const entryId = view.kind === "entry" ? view.id : 0;
  const category = categories.find(function match(item) {
    return item.key === categoryKey;
  });
  useEffect(function watchExport() {
    return function cleanup() { exportController.current?.abort(); };
  }, []);

  async function downloadCompleted() {
    if (exportController.current) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportMessage("");
    setError("");
    try {
      const response = await fetch("/api/encyclopedia/export", { method: "POST", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "导出失败，请重试。");
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setExportMessage("已生成包含 " + result.count + " 个词条的压缩包，已发起下载。");
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "导出失败。");
    } finally {
      exportController.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  const refresh = useCallback(
    async function refresh(signal?: AbortSignal) {
      const version = ++refreshVersion.current;
      if (kind === "home")
        setHome(
          await readJson<HomeResponse>("/api/encyclopedia/categories", signal),
        );
      if (kind === "category") {
        const result = await readJson<EntriesResponse>(
          "/api/encyclopedia/categories/" +
            categoryKey +
            "?q=" +
            encodeURIComponent(search) +
            "&page=" +
            page +
            "&status=" +
            encodeURIComponent(status),
          signal,
        );
        if (!signal?.aborted && version === refreshVersion.current)
          setEntries(result);
      }
      if (kind === "entry")
        setDetail(
          await readJson<DetailResponse>(
            "/api/encyclopedia/entries/" + entryId,
            signal,
          ),
        );
    },
    [kind, categoryKey, entryId, search, page, status],
  );
  useEffect(
    function loadPage() {
      const controller = new AbortController();
      async function load() {
        setLoading(true);
        setError("");
        try {
          await refresh(controller.signal);
        } catch (failure) {
          if (!controller.signal.aborted)
            setError(failure instanceof Error ? failure.message : "读取失败。");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }
      void load();
      return function cleanup() {
        controller.abort();
      };
    },
    [refresh],
  );
  useEffect(
    function followTasks() {
      const events = new EventSource("/api/encyclopedia/events");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let phases = "";
      events.onopen = function ready() {
        setConnected(true);
      };
      events.onerror = function disconnected() {
        setConnected(false);
      };
      events.addEventListener("tasks", function changed(event: MessageEvent) {
        const body = JSON.parse(event.data) as { tasks: EntryTask[] };
        setTasks(body.tasks);
        const nextPhases = body.tasks
          .map(function phase(task) {
            return task.entityId + ":" + task.phase + ":" + task.desired;
          })
          .join(",");
        if (kind === "category" && status !== "all" && phases !== nextPhases) {
          phases = nextPhases;
          clearTimeout(timer);
          timer = setTimeout(function updateCategory() {
            void refresh(controller.signal).catch(function failed(failure) {
              if (!controller.signal.aborted) setError(String(failure));
            });
          }, 500);
        }
        const task = body.tasks.find(function current(item) {
          return item.entityId === entryId;
        });
        if (
          kind === "entry" &&
          task &&
          task.updatedAt !== detailVersion.current
        ) {
          detailVersion.current = task.updatedAt;
          clearTimeout(timer);
          timer = setTimeout(function update() {
            void refresh(controller.signal).catch(function failed(failure) {
              if (!controller.signal.aborted) setError(String(failure));
            });
          }, 500);
        }
      });
      return function cleanup() {
        events.close();
        controller.abort();
        clearTimeout(timer);
      };
    },
    [entryId, kind, refresh, status],
  );

  // 固定回调身份，避免模型选择器因父组件刷新而反复读取缓存。
  const modelChanged = useCallback(function modelChanged(
    model: string,
    reasoning: string,
  ) {
    setSelection(function update(previous) {
      if (previous.model === model && previous.reasoning === reasoning)
        return previous;
      return { model, reasoning };
    });
  }, []);
  async function operate(id: number, action: BatchAction) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/encyclopedia/entries/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...selection }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作失败。");
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败。");
    } finally {
      setBusy(null);
    }
  }
  async function downloadCategoryFields() {
    if (!categoryKey || downloadingFields) return;
    setDownloadingFields(true);
    setError("");
    try {
      const response = await fetch(
        "/api/encyclopedia/categories/" + categoryKey + "/fields",
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json().catch(function invalid() { return {}; });
        throw new Error(body.error || "字段表下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "encyclopedia-" + categoryKey + "-fields.md";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "字段表下载失败。");
    } finally {
      setDownloadingFields(false);
    }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (batchBusy) return;
    setSelectedIds(new Set());
    setSearch(query.trim());
    setPage(1);
  }
  function taskFor(id: number, fallback?: EntryTask | null) {
    return (
      tasks.find(function match(task) {
        return task.entityId === id;
      }) || fallback
    );
  }
  const active = tasks.filter(function running(task) {
    return taskFilterGroup(task) === "running";
  });
  const currentTask = detail ? taskFor(detail.entry.id, detail.task) : null;
  function controls(id: number, task?: EntryTask | null, excluded = false) {
    const running = task && taskFilterGroup(task) === "running";
    return (
      <div className="ep-actions">
        <button
          className="ep-button ep-primary"
          disabled={busy === id || batchBusy || !!running || excluded || task?.phase === "completed"}
          onClick={function start() {
            void operate(id, "continue");
          }}
        >
          ▷{" "}
          {busy === id ? "正在处理…" : "开始"}
        </button>
        <button
          className="ep-button"
          disabled={busy === id || batchBusy || !!running || excluded || !task}
          onClick={function restart() {
            void operate(id, "restart");
          }}
        >
          重新开始
        </button>
        <button
          className="ep-button"
          disabled={
            busy === id ||
            batchBusy ||
            !task ||
            (task.desired === "stopped" &&
              !task.sessionId &&
              !task.cleanupSessions.length) ||
            task.phase === "stopping"
          }
          onClick={function stop() {
            void operate(id, "stop");
          }}
        >
          □ 停止
        </button>
      </div>
    );
  }
  function renderEntry(entry: EntrySummary) {
    const task = taskFor(entry.id, entry.task);
    return (
      <article className="ep-entry-card" key={entry.id}>
        <div className="ep-card-top">
          <label className="ep-check-label ep-id">
            <input
              type="checkbox"
              aria-label={"选择词条 " + entry.name}
              checked={selectedIds.has(entry.id)}
              disabled={batchBusy}
              onChange={function toggle(event) {
                const checked = event.target.checked;
                setSelectedIds(function update(previous) {
                  const next = new Set(previous);
                  if (checked) next.add(entry.id);
                  else next.delete(entry.id);
                  return next;
                });
              }}
            />
            #{entry.id} · {entry.typeName}
          </label>
          <TaskStatus task={task} />
        </div>
        <Link
          href={"/encyclopedia/entries/" + entry.id}
          className="ep-entry-title"
        >
          {entry.name}
          <span aria-hidden="true">↗</span>
        </Link>
        {entry.nameEn && entry.nameEn !== entry.name && (
          <p className="ep-subtitle">{entry.nameEn}</p>
        )}
        <TaskProgress task={task} counts={task && Array.isArray(task.processedFields) ? undefined : entry.progress} />
        <div className="ep-card-bottom">
          <span>
            {task?.mode === "restart" ? "重新处理全部字段" : "开始后只处理未检查字段"}
          </span>
          <span>
            {entry.state === "excluded"
              ? "已排除 · 仅查看"
              : "版本 " + entry.version}
          </span>
        </div>
        {controls(entry.id, task, entry.state === "excluded")}
      </article>
    );
  }
  const processed = new Set(processedFieldKeys(detail?.task));
  const fields = (detail?.entry.fields || []).filter(function visible(field) {
    const result = detail?.task?.results[field.key];
    if (
      fieldSearch &&
      !(field.label + field.key + displayValue(field.value))
        .toLowerCase()
        .includes(fieldSearch.toLowerCase())
    )
      return false;
    if (filter === "empty") return field.writable && !hasFieldValue(field.value);
    if (filter === "review")
      return (
        result && ["tentative", "conflict", "blocked"].includes(result.outcome)
      );
    if (filter === "unchecked") return field.writable && !processed.has(field.key);
    return true;
  });
  const stats = currentTask ? taskProgress(currentTask) : null;
  const counts = detail ? fieldProgress(detail.entry.fields, currentTask) : undefined;
  const terminalGuard: GuardSnapshot = {
    instanceId: "encyclopedia",
    revision: 0,
    runId: currentTask?.generation || 0,
    phase:
      currentTask?.sessionId && activePhases.has(currentTask.phase)
        ? "running"
        : "paused",
    settings: currentTask
      ? {
          sessionId: currentTask.sessionId || "",
          model: currentTask.model,
          reasoning: currentTask.reasoning,
          startMessage: "",
          completeMessage: "",
          retryMessage: "",
        }
      : null,
    sessionTitle: detail?.entry.name || "",
    projectPath: "",
    turnId: null,
    nextMessage: null,
    requests: [],
    logs: [],
  };

  return (
    <div className="ep-app">
      <header className="ep-header">
        <Link href="/" className="ep-brand">
          <span className="ep-brand-icon">知</span>
          <span>
            百科采集工作台<small>ENCYCLOPEDIA WORKSPACE</small>
          </span>
        </Link>
        <nav aria-label="主导航">
          <Link href="/" className={kind !== "running" ? "ep-nav-active" : ""}>
            词条库
          </Link>
          <Link
            href="/encyclopedia/running"
            className={kind === "running" ? "ep-nav-active" : ""}
          >
            运行中的任务<span className="ep-nav-count">{active.length}</span>
          </Link>
        </nav>
        <span className="ep-connection">
          <i className={connected ? "online" : ""} />
          {connected ? "本地服务已连接" : "正在连接服务"}
        </span>
      </header>
      <main className="ep-main">
        {kind !== "home" && (
          <div className="ep-breadcrumb">
            <Link href="/">词条库</Link>
            <span>/</span>
            {kind === "entry" && detail ? (
              <>
                <Link
                  href={
                    "/encyclopedia/category/" +
                    (categories.find(function match(item) {
                      return item.types.includes(detail.entry.type);
                    })?.key || "entry")
                  }
                >
                  {detail.entry.typeName}
                </Link>
                <span>/</span>
                <span>#{entryId}</span>
              </>
            ) : (
              <span>{kind === "running" ? "任务管理" : category?.name}</span>
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="ep-error">
            {error}
            <button
              onClick={function dismiss() {
                setError("");
              }}
              aria-label="关闭错误提示"
            >
              ×
            </button>
          </div>
        )}
        {kind === "home" && (
          <>
            <section className="ep-hero">
              <div>
                <p className="ep-kicker">你的知识，逐条完善</p>
                <h1>
                  让每一条信息，
                  <br />
                  <span>都有据可查。</span>
                </h1>
                <p className="ep-lead">
                  浏览数据库中的词条，启动独立核查。
                  <br />
                  从资料搜寻到字段补齐，进度与证据始终可见。
                </p>
              </div>
              <div className="ep-hero-aside">
                <span className="ep-large-number">
                  {home
                    ? home.categories
                        .reduce(function sum(total, item) {
                          return total + item.total;
                        }, 0)
                        .toLocaleString("zh-CN")
                    : "—"}
                </span>
                <p>个词条 · {categories.length} 大分类</p>
                <Link href="/encyclopedia/running" className="ep-running-link">
                  <span>
                    <i className="ep-live-dot" />
                    {active.length} 个任务进行中
                  </span>
                  <span>查看任务 ↗</span>
                </Link>
              </div>
            </section>
            <section className="ep-export" aria-label="导出已完成词条">
              <div>
                <h2>保存已完成的成果</h2>
                <p>一键下载全部已完成词条的数据库，以及关联原件和图片。</p>
                <p className="ep-export-status" role="status" aria-live="polite">
                  {exporting ? "正在准备数据库和附件，文件较多时请稍候…" : exportMessage || "仅包含已完成词条；数据库结构和原始 ID 保持不变。"}
                </p>
              </div>
              <button className="ep-button ep-primary" onClick={downloadCompleted} disabled={exporting} aria-busy={exporting}>
                {exporting ? "正在打包…" : "导出全部已完成词条"}
              </button>
            </section>
            <div className="ep-section-title">
              <h2>探索词条库</h2>
              <span>直接读取本地数据库 · 按原始 ID 排序</span>
            </div>
            <div className="ep-categories">
              {categories.map(function tile(item) {
                const count = home?.categories.find(function match(counted) {
                  return counted.key === item.key;
                });
                return (
                  <Link
                    key={item.key}
                    href={"/encyclopedia/category/" + item.key}
                    className={"ep-category ep-category-" + item.key}
                  >
                    <div className="ep-category-top">
                      <span className="ep-category-icon">
                        <CategoryIcon type={item.key} />
                      </span>
                      <span className="ep-index">{item.mark}</span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="ep-category-footer">
                      <span>
                        <strong>
                          {count ? count.total.toLocaleString("zh-CN") : "—"}
                        </strong>{" "}
                        个词条
                      </span>
                      <span className="ep-arrow">↗</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="ep-info-strip">
              <span>01 选择词条</span>
              <span>02 启动信息核查</span>
              <span>03 查看字段与证据</span>
              <span>04 全部处理完成后结束</span>
            </div>
          </>
        )}
        {kind === "category" && (
          <>
            <div className="ep-page-heading">
              <div>
                <p className="ep-kicker">词条分类 / {category?.mark}</p>
                <h1>{category?.name || "分类不存在"}</h1>
                <p className="ep-muted">
                  {category?.description} ·{" "}
                  {entries?.total.toLocaleString("zh-CN") || "—"} 个词条
                </p>
              </div>
              <button
                type="button"
                className="ep-button"
                disabled={batchBusy || loading || downloadingFields || !category}
                onClick={function download() {
                  void downloadCategoryFields();
                }}
              >
                {downloadingFields ? "正在生成字段表…" : "下载字段表 · Markdown"}
              </button>
              <form onSubmit={submitSearch} className="ep-search">
                <input
                  aria-label="搜索词条名称或 ID"
                  disabled={batchBusy}
                  value={query}
                  onChange={function change(event) {
                    setQuery(event.target.value);
                  }}
                  placeholder="搜索名称、英文名或 ID"
                />
                <button type="submit" disabled={batchBusy}>
                  搜索
                </button>
              </form>
            </div>
            <div className="ep-status-filter">
              <label htmlFor="entry-status">任务状态</label>
              <select
                id="entry-status"
                value={status}
                disabled={batchBusy}
                onChange={function change(event) {
                  setStatus(event.target.value);
                  setSelectedIds(new Set());
                  setPage(1);
                }}
              >
                {taskFilters.map(function option(item) {
                  return (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  );
                })}
              </select>
              <span className="ep-muted">
                “已完成”表示所有可处理字段均已检查；“完成部分”包含已启动但处理了 0 个字段就停止的任务。
              </span>
            </div>
            <EncyclopediaBatch
              key={categoryKey + ":" + search + ":" + status}
              category={categoryKey}
              search={search}
              status={status}
              entries={entries?.entries || []}
              total={entries?.total || 0}
              loading={loading}
              selected={selectedIds}
              onSelection={setSelectedIds}
              onBusy={setBatchBusy}
              onRefresh={refresh}
            />
            {loading ? (
              <p className="ep-loading">正在读取数据库…</p>
            ) : (
              <>
                <div className="ep-entry-grid">
                  {entries?.entries.map(renderEntry)}
                </div>
                {entries?.total === 0 && (
                  <div className="ep-empty">没有找到匹配的词条。</div>
                )}
              </>
            )}
            {entries && (
              <div className="ep-pagination">
                <button
                  className="ep-button"
                  disabled={batchBusy || loading || entries.page <= 1}
                  onClick={function previous() {
                    setPage(entries.page - 1);
                  }}
                >
                  ← 上一页
                </button>
                <span>
                  第 {entries.page} / {entries.pages} 页
                </span>
                <button
                  className="ep-button"
                  disabled={
                    batchBusy || loading || entries.page >= entries.pages
                  }
                  onClick={function next() {
                    setPage(entries.page + 1);
                  }}
                >
                  下一页 →
                </button>
              </div>
            )}
          </>
        )}
        {kind === "running" && (
          <>
            <div className="ep-page-heading">
              <div>
                <p className="ep-kicker">任务管理</p>
                <h1>正在完善的知识</h1>
                <p className="ep-muted">
                  同时研究 2
                  个词条，其余自动排队。关闭网页后，本地服务继续运行。
                </p>
              </div>
              <span className="ep-count-pill">{active.length} 个活动任务</span>
            </div>
            <div className="ep-tabs">
              <button
                className={!showHistory ? "selected" : ""}
                onClick={function running() {
                  setShowHistory(false);
                }}
              >
                正在进行 {active.length}
              </button>
              <button
                className={showHistory ? "selected" : ""}
                onClick={function history() {
                  setShowHistory(true);
                }}
              >
                全部任务 {tasks.length}
              </button>
            </div>
            <div className="ep-task-list">
              {(showHistory ? tasks : active).map(function taskRow(task) {
                return (
                  <article className="ep-task-row" key={task.entityId}>
                    <div className="ep-task-main">
                      <div className="ep-card-top">
                        <span className="ep-id">
                          #{task.entityId} · {task.mode === "restart" ? "重新开始" : "开始"}
                        </span>
                        <TaskStatus task={task} />
                      </div>
                      <Link
                        className="ep-entry-title"
                        href={"/encyclopedia/entries/" + task.entityId}
                      >
                        {task.name} ↗
                      </Link>
                      <p className="ep-muted">{task.message}</p>
                    </div>
                    <div className="ep-task-progress">
                      <TaskProgress task={task} />
                      <p className="ep-muted">
                        执行尝试 {task.attempt} 次
                      </p>
                    </div>
                    {controls(task.entityId, task)}
                  </article>
                );
              })}
            </div>
            {(showHistory ? tasks : active).length === 0 && (
              <div className="ep-empty">
                <span className="ep-empty-symbol">◎</span>
                <h2>
                  {showHistory ? "还没有采集任务" : "当前没有运行中的任务"}
                </h2>
                <p>打开一个词条，点击开始搜索，即可在这里跟踪进度。</p>
                <Link href="/" className="ep-button ep-primary">
                  浏览词条库 →
                </Link>
              </div>
            )}
          </>
        )}
        {kind === "entry" && loading && !detail && (
          <p className="ep-loading">正在读取词条与字段定义…</p>
        )}
        {kind === "entry" && detail && (
          <>
            <div className="ep-detail-heading">
              <p className="ep-kicker">
                {detail.entry.typeName} / #{detail.entry.id}
              </p>
              <h1>{detail.entry.name}</h1>
              {detail.entry.type==="device"?<EntryGalleryCover id={detail.entry.id} name={detail.entry.name} value={detail.entry.fields.find(function gallery(field){return field.fieldKey==="gallery";})?.value||null}/>:null}
              {detail.entry.nameEn &&
                detail.entry.nameEn !== detail.entry.name && (
                  <p className="ep-lead">{detail.entry.nameEn}</p>
                )}
              <div className="ep-detail-meta">
                <TaskStatus task={currentTask} />
                <span>数据库版本 {detail.entry.version}</span>
                <span>{detail.entry.fields.length} 个字段</span>
                <span>{detail.entry.originals.length} 份关联原件</span>
                {detail.entry.state === "excluded" && (
                  <span>已排除 · 仅查看</span>
                )}
              </div>
            </div>
            <section className="ep-control-card">
              <div>
                <h2>
                  {currentTask?.mode === "restart" ? "重新处理全部字段" : "词条信息填充"}
                </h2>
                <p>
                  {currentTask?.message ||
                    "按字段规则查阅网络与本地原件，逐项保存有依据的结果。"}
                </p>
              </div>
              {controls(
                detail.entry.id,
                currentTask,
                detail.entry.state === "excluded",
              )}
              <div className="ep-metrics">
                <div>
                  <strong>{counts ? counts.filled + " / " + counts.total : "—"}</strong>
                  <span>已填充</span>
                </div>
                <div>
                  <strong>
                    {counts ? counts.checked + " / " + counts.total : "—"}
                  </strong>
                  <span>已处理</span>
                </div>
                <div>
                  <strong>{stats?.verified || 0}</strong>
                  <span>有据核实</span>
                </div>
                <div>
                  <strong>{stats?.pendingReview || 0}</strong>
                  <span>待复核</span>
                </div>
                <div>
                  <strong>
                    {
                      detail.entry.fields.filter(function empty(field) {
                        return field.writable && !hasFieldValue(field.value);
                      }).length
                    }
                  </strong>
                  <span>当前仍为空</span>
                </div>
                <div>
                  <strong>{currentTask?.unconfirmed || 0}</strong>
                  <span>提交待确认</span>
                </div>
              </div>
              <TaskProgress task={currentTask} counts={counts} />
              <p className="ep-control-note">
                开始只处理未检查字段；重新开始会清零处理进度，保留现有内容。停止会中断并删除当前会话，已处理结果保留。查无资料也算已处理；只读或禁止采集字段不计入总数。
              </p>
              {!!currentTask?.cleanupSessions.length && (
                <p className="ep-notice">
                  {currentTask.cleanupSessions.length} 个旧会话待清理。
                  {currentTask.cleanupError}
                </p>
              )}
            </section>
            <details className="ep-settings">
              <summary>
                模型与执行设置{currentTask ? " · " + currentTask.model : ""}
              </summary>
              <ModelSelector
                model={selection.model}
                reasoning={selection.reasoning}
                onChange={modelChanged}
                restorePreference
                locked={!!currentTask && activePhases.has(currentTask.phase)}
              />
              <p className="ep-muted">
                规则：encyclopedia-collect · 仅处理当前词条 ·
                临时文件保存在百科工作目录。
              </p>
            </details>
            <div className="ep-section-title">
              <h2>
                字段信息 <span>{detail.entry.fields.length}</span>
              </h2>
              <span>点击字段展开原值、证据与核查说明</span>
            </div>
            <div className="ep-field-toolbar">
              <div className="ep-tabs">
                {[
                  ["all", "全部字段"],
                  ["unchecked", "未核查"],
                  ["empty", "仍为空"],
                  ["review", "待复核"],
                ].map(function tab([key, label]) {
                  return (
                    <button
                      key={key}
                      className={filter === key ? "selected" : ""}
                      onClick={function select() {
                        setFilter(key);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input
                aria-label="筛选字段"
                placeholder="查找字段或内容…"
                value={fieldSearch}
                onChange={function searchField(event) {
                  setFieldSearch(event.target.value);
                }}
              />
            </div>
            <div className="ep-fields">
              {fields.map(function fieldRow(field) {
                return (
                  <FieldRow key={field.key} field={field} task={detail.task} entityId={detail.entry.id}/>
                );
              })}
              {!fields.length && <p className="ep-empty">没有匹配的字段。</p>}
            </div>
            <details className="ep-history">
              <summary>
                数据库已有来源与原件 · {detail.entry.evidence.length} 条证据
              </summary>
              {detail.entry.originals.map(function original(item) {
                return (
                  <p key={item.path} className="ep-source">
                    {item.path}
                    <br />
                    <span className="ep-muted">{item.localPath}</span>
                  </p>
                );
              })}
              {detail.entry.evidence.map(function source(item, index) {
                return (
                  <div key={index} className="ep-source">
                    <strong>{item.title}</strong>
                    <p className="ep-muted">
                      {item.field} · {item.locator}
                    </p>
                    <blockquote>{item.excerpt}</blockquote>
                    {/^https?:\/\//.test(item.uri) && (
                      <a href={item.uri} target="_blank" rel="noreferrer">
                        查看来源 ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </details>
            <div className="ep-section-title">
              <h2>实时执行窗口</h2>
              <span>独立会话 · 完成后自动清理</span>
            </div>
            <GuardTerminal
              guardId={String(entryId)}
              guard={terminalGuard}
              apiBase="/api/encyclopedia/entries"
            />
            <details className="ep-history">
              <summary>
                执行记录 <span>{detail.history.events.length}</span>
              </summary>
              {detail.history.events.map(function event(item, index) {
                return (
                  <div key={index} className="ep-history-row">
                    <time>{formatDate(item.created_at)}</time>
                    <span>{item.detail || item.event}</span>
                  </div>
                );
              })}
              {!detail.history.events.length && (
                <p className="ep-muted">
                  尚无本应用执行记录；数据库已有内容与证据保持原样。
                </p>
              )}
            </details>
          </>
        )}
        <footer className="ep-footer">
          <span>百科采集工作台 · 本地工作区</span>
          <span>
            {kind === "home" && home
              ? home.workspace
              : "来源可追溯 · 进度可恢复"}
          </span>
          <Link href="/guards">通用守护 ↗</Link>
        </footer>
      </main>
    </div>
  );
}
