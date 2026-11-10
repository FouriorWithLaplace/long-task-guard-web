"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  categories,
  fieldProgress,
  fieldIsProcessed,
  hasProgramResult,
  isProgramField,
  isTrackedField,
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
import { encyclopediaDefaultModel } from "@/types/model";
import { entrySortOptions, taskSortOptions, readEntrySort, readTaskSort } from "@/types/entry-sort";
import type { TaskSort } from "@/types/entry-sort";
import GuardTerminal from "./GuardTerminal";
import ModelSelector from "./ModelSelector";
import EncyclopediaBatch from "./EncyclopediaBatch";
import EncyclopediaConcurrency from "./EncyclopediaConcurrency";
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
  activeCount: number;
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

function queueLabel(task: EntryTask): string {
  const queue = task.displayQueue;
  if (!queue) return "";
  if (queue.state === "waiting") return "全局排队第 " + queue.position + " 位";
  if (queue.state === "delayed") return "等待重试或恢复，暂未就绪";
  if (queue.state === "stopping") return "正在停止";
  if (queue.state === "inactive") return "未在执行队列";
  if (task.phase === "retrying") return "等待重试 · 保留执行名额";
  if (task.phase === "blocked") return "等待处理 · 保留执行名额";
  if (task.phase === "stopping" || task.phase === "completed") return "正在结束 · 占用执行名额";
  return "执行中 · 占用执行名额";
}

export default function EncyclopediaPanel({ view }: { view: View }) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [entries, setEntries] = useState<EntriesResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [tasks, setTasks] = useState<EntryTask[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPages, setTaskPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);
  const [taskCategory, setTaskCategory] = useState("all");
  const [filteredActiveCount, setFilteredActiveCount] = useState(0);
  const [loadedTaskView, setLoadedTaskView] = useState("");
  const [error, setError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedStatus, setStatus] = useState("all");
  const [selectedSort, setSort] = useState<TaskSort>("default");
  const sort = view.kind !== "running" && selectedSort === "execution" ? "default" : selectedSort;
  // 热更新可能保留已删除的筛选值，回退到“全部”后再请求列表。
  const status = taskFilters.some(function available(filter) {
    return filter.value === selectedStatus;
  }) ? selectedStatus : "all";
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [runningBatchBusy, setRunningBatchBusy] = useState(false);
  const [downloadingFields, setDownloadingFields] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const exportController = useRef<AbortController | null>(null);
  const fieldsController = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState("all");
  const [fieldSearch, setFieldSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const taskView = taskCategory + ":" + showHistory + ":" + taskPage + ":" + sort;
  const tasksLoading = loadedTaskView !== taskView;
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
    return function cleanup() {
      exportController.current?.abort();
      fieldsController.current?.abort();
    };
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
            encodeURIComponent(status) + "&sort=" + sort,
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
    [kind, categoryKey, entryId, search, page, status, sort],
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
    function followPage() {
      const params = new URLSearchParams({
        view: kind, category: kind === "running" ? taskCategory : categoryKey, id: String(entryId),
        q: search, status, sort, page: String(kind === "running" ? taskPage : page), history: String(showHistory),
      });
      const events = new EventSource("/api/encyclopedia/events?" + params);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      events.onopen = function ready() { if (!controller.signal.aborted) setConnected(true); };
      events.onerror = function disconnected() { if (!controller.signal.aborted) setConnected(false); };
      events.addEventListener("view", function changed(event: MessageEvent) {
        if (controller.signal.aborted) return;
        const body = JSON.parse(event.data);
        setActiveCount(body.activeCount);
        if (body.home) setHome(body.home);
        if (body.entries) setEntries(body.entries);
        if (body.tasks) {
          setTasks(body.tasks);
          setTaskPages(body.pages);
          setTotalTasks(body.totalTasks);
          setFilteredActiveCount(body.filteredActiveCount);
          setLoadedTaskView(taskCategory + ":" + showHistory + ":" + body.page + ":" + sort);
          if (body.page !== taskPage) setTaskPage(body.page);
        }
        if (body.detailRevision && body.detailRevision !== detailVersion.current) {
          const hadVersion = detailVersion.current !== "";
          detailVersion.current = body.detailRevision;
          if (hadVersion) {
            clearTimeout(timer);
            timer = setTimeout(function updateDetail() {
              void refresh(controller.signal).catch(function failed(failure) {
                if (!controller.signal.aborted) setError(String(failure));
              });
            }, 300);
          }
        }
      });
      return function cleanup() {
        events.close();
        controller.abort();
        clearTimeout(timer);
        detailVersion.current = "";
      };
    },
    [entryId, categoryKey, kind, refresh, status, search, page, showHistory, taskPage, taskCategory, sort],
  );


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
    setOperationMessage("");
    try {
      const response = await fetch("/api/encyclopedia/entries/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...selection }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "操作失败。");
      if (action === "configure") setOperationMessage("模型设置已保存；运行中的任务从下一轮请求生效，已处理进度保留。");
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败。");
    } finally {
      setBusy(null);
    }
  }
  async function downloadCategoryFields() {
    if (!categoryKey) return;
    await downloadFields("/api/encyclopedia/categories/" + categoryKey + "/fields", "encyclopedia-" + categoryKey + "-fields.md");
  }
  async function downloadAllFields() {
    await downloadFields("/api/encyclopedia/fields", "encyclopedia-all-fields.md");
  }
  async function downloadFields(endpoint: string, filename: string) {
    if (fieldsController.current) return;
    const controller = new AbortController();
    fieldsController.current = controller;
    setDownloadingFields(true);
    setError("");
    try {
      const response = await fetch(
        endpoint,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) {
        const body = await response.json().catch(function invalid() { return {}; });
        throw new Error(body.error || "字段表下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "字段表下载失败。");
    } finally {
      fieldsController.current = null;
      if (!controller.signal.aborted) setDownloadingFields(false);
    }
  }
  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (batchBusy) return;
    setSelectedIds(new Set());
    setSearch(query.trim());
    setPage(1);
  }
  const active = tasks.filter(function running(task) {
    return taskFilterGroup(task) === "running";
  });
  const currentTask = detail?.task || null;
  const modelReady = !!selection.model && !!selection.reasoning;
  function sortControls() {
    return (
      <>
        <label htmlFor="entry-sort">排序方式</label>
        <select id="entry-sort" value={sort} disabled={batchBusy || runningBatchBusy || busy !== null}
          onChange={function changeSort(event) {
            setSort(kind === "running" ? readTaskSort(event.target.value) : readEntrySort(event.target.value));
            setPage(1);
            setTaskPage(1);
            setTasks([]);
            setLoadedTaskView("");
            setLoading(true);
          }}>
          {(kind === "running" ? taskSortOptions : entrySortOptions).map(function option(item) {
            return <option key={item.value} value={item.value}>{item.label}</option>;
          })}
        </select>
      </>
    );
  }
  function modelSettings(task?: EntryTask | null) {
    const locked = batchBusy || runningBatchBusy || busy !== null;
    return (
      <section className="ep-settings" aria-label="模型与推理强度">
        <h2 className="mb-4 font-semibold">模型与推理强度</h2>
        <ModelSelector
          model={selection.model}
          reasoning={selection.reasoning}
          onChange={modelChanged}
          defaultSelection={encyclopediaDefaultModel}
          preferenceKey="encyclopedia.model-selection.v1"
          locked={locked}
        />
        <p className="ep-muted">
          默认 GPT-6 Astra / medium，可选择 high 等强度。开始任务时使用以上设置；修改已有任务请点击应用。
          运行中从下一轮请求生效，保留已处理进度；停止的任务不会自动开始。
        </p>
        {task && (
          <div className="ep-actions mt-4">
            <span className="ep-muted">任务设置：{task.model} / {task.reasoning}</span>
            <button className="ep-button" disabled={locked || !modelReady || task.phase === "stopping"}
              onClick={function apply() { void operate(task.entityId, "configure"); }}>
              应用到当前任务
            </button>
          </div>
        )}
      </section>
    );
  }
  function controls(id: number, task?: EntryTask | null, excluded = false) {
    const running = task && taskFilterGroup(task) === "running";
    const controlsBusy = batchBusy || runningBatchBusy;
    return (
      <div className="ep-actions">
        <button
          className="ep-button ep-primary"
          disabled={busy === id || controlsBusy || !modelReady || !!running || excluded || task?.phase === "completed"}
          onClick={function start() {
            void operate(id, "continue");
          }}
        >
          ▷{" "}
          {busy === id ? "正在处理…" : "开始"}
        </button>
        <button
          className="ep-button"
          disabled={busy === id || controlsBusy || !modelReady || !!running || excluded || !task}
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
            controlsBusy ||
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
    const task = entry.task;
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
        <TaskProgress task={task} counts={entry.progress} />
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
  const fields = (detail?.entry.fields || []).filter(function visible(field) {
    const result = detail?.task?.results[field.key];
    if (
      fieldSearch &&
      !(field.label + field.key + displayValue(field.value))
        .toLowerCase()
        .includes(fieldSearch.toLowerCase())
    )
      return false;
    if (filter === "empty") return isTrackedField(field) && !(isProgramField(field) ? hasProgramResult(field.value) : hasFieldValue(field.value));
    if (filter === "review")
      return (
        result && ["tentative", "conflict", "blocked"].includes(result.outcome)
      );
    if (filter === "unchecked") return isTrackedField(field) && !fieldIsProcessed(field, currentTask);
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
            运行中的任务<span className="ep-nav-count">{activeCount}</span>
          </Link>
        </nav>
        <span className="ep-connection">
          <i className={connected ? "online" : ""} />
          {connected ? "本地服务已连接" : "正在连接服务"}
        </span>
      </header>
      <main className="ep-main">
        <EncyclopediaConcurrency />
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
        {operationMessage && <p role="status" className="ep-notice">{operationMessage}</p>}
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
                    {activeCount} 个任务进行中
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
              <button className="ep-button" onClick={downloadAllFields} disabled={downloadingFields} aria-busy={downloadingFields}>
                {downloadingFields ? "正在导出字段…" : "导出全部分类字段 · Markdown"}
              </button>
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
            {modelSettings()}
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
              {sortControls()}
              <span className="ep-muted">
                “已完成”表示所有可处理字段均已检查；“完成部分”包含已启动但处理了 0 个字段就停止的任务。
              </span>
            </div>
            <EncyclopediaBatch
              key={categoryKey + ":" + search + ":" + status}
              modelSelection={selection}
              selectionUrl={"/api/encyclopedia/categories/" + categoryKey + "?" + new URLSearchParams({ q: search, status, sort, selection: "all" })}
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
              <span className="ep-count-pill">{tasksLoading ? "…" : filteredActiveCount} 个活动任务</span>
            </div>
            {modelSettings()}
            <div className="ep-status-filter">
              <label htmlFor="task-category">词条分类</label>
              <select
                id="task-category"
                value={taskCategory}
                disabled={runningBatchBusy || busy !== null}
                onChange={function changeCategory(event) {
                  setTaskCategory(event.target.value);
                  setTaskPage(1);
                  setSelectedTaskIds(new Set());
                  setTasks([]);
                  setConnected(false);
                }}
              >
                <option value="all">全部分类</option>
                {categories.map(function option(category) {
                  return <option key={category.key} value={category.key}>{category.name}</option>;
                })}
              </select>
              {sortControls()}
              <span className="ep-muted">列表、分页和跨页全选均按当前分类筛选。</span>
            </div>
            {sort === "execution" && (
              <p className="ep-muted mb-4">
                占用执行名额的任务在前，其余按实际入队次序排列；最多同时执行 2 个任务。
                排队序号按全部分类计算，未到重试时间的任务暂不参与排队；停止和完成的任务排在最后。
              </p>
            )}
            <div className="ep-tabs">
              <button
                className={!showHistory ? "selected" : ""}
                disabled={runningBatchBusy || busy !== null}
                onClick={function running() {
                  if (!showHistory) return;
                  setShowHistory(false);
                  setTaskPage(1);
                  setSelectedTaskIds(new Set());
                  setTasks([]);
                  setConnected(false);
                }}
              >
                正在进行 {tasksLoading ? "…" : filteredActiveCount}
              </button>
              <button
                className={showHistory ? "selected" : ""}
                disabled={runningBatchBusy || busy !== null}
                onClick={function history() {
                  if (showHistory) return;
                  setShowHistory(true);
                  setTaskPage(1);
                  setSelectedTaskIds(new Set());
                  setTasks([]);
                  setConnected(false);
                }}
              >
                全部任务 {tasksLoading ? "…" : totalTasks}
              </button>
            </div>
            <EncyclopediaBatch
              key={"tasks:" + taskCategory + ":" + showHistory}
              modelSelection={selection}
              label="运行任务批量操作"
              selectionUrl={"/api/encyclopedia/tasks?" + new URLSearchParams({ history: String(showHistory), category: taskCategory, sort, selection: "all" })}
              entries={(showHistory ? tasks : active).map(function selectable(task) { return { id: task.entityId }; })}
              total={tasksLoading ? 0 : showHistory ? totalTasks : filteredActiveCount}
              loading={loading || !connected || tasksLoading}
              disabled={busy !== null}
              selected={selectedTaskIds}
              onSelection={setSelectedTaskIds}
              onBusy={setRunningBatchBusy}
              onRefresh={refresh}
            />
            {tasksLoading && <p className="ep-loading" role="status">正在读取任务…</p>}
            <div className="ep-task-list">
              {(showHistory ? tasks : active).map(function taskRow(task) {
                return (
                  <article className="ep-task-row" key={task.entityId}>
                    <div className="ep-task-main">
                      <div className="ep-card-top">
                        <label className="ep-check-label ep-id">
                          <input
                            type="checkbox"
                            aria-label={"选择任务 " + task.name}
                            checked={selectedTaskIds.has(task.entityId)}
                            disabled={runningBatchBusy}
                            onChange={function toggle(event) {
                              const checked = event.target.checked;
                              setSelectedTaskIds(function update(previous) {
                                const next = new Set(previous);
                                if (checked) next.add(task.entityId);
                                else next.delete(task.entityId);
                                return next;
                              });
                            }}
                          />
                          #{task.entityId} · {task.mode === "restart" ? "重新开始" : "开始"}
                        </label>
                        <TaskStatus task={task} />
                        {sort === "execution" && task.displayQueue && (
                          <span className="ep-badge">{queueLabel(task)}</span>
                        )}
                      </div>
                      <Link
                        className="ep-entry-title"
                        href={"/encyclopedia/entries/" + task.entityId}
                      >
                        {task.name} ↗
                      </Link>
                      <p className="ep-muted">{task.message}</p>
                      <p className="ep-muted">任务设置：{task.model} / {task.reasoning}</p>
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
            {!tasksLoading && taskPages > 1 && (
              <div className="ep-pagination">
                <button className="ep-button" disabled={runningBatchBusy || !connected || taskPage <= 1} onClick={function previous() { setTaskPage(taskPage - 1); setTasks([]); setConnected(false); }}>&larr;</button>
                <span>{taskPage} / {taskPages}</span>
                <button className="ep-button" disabled={runningBatchBusy || !connected || taskPage >= taskPages} onClick={function next() { setTaskPage(taskPage + 1); setTasks([]); setConnected(false); }}>&rarr;</button>
              </div>
            )}
            {!tasksLoading && (showHistory ? tasks : active).length === 0 && (
              <div className="ep-empty">
                <span className="ep-empty-symbol">◎</span>
                <h2>
                  {taskCategory !== "all" ? "该分类下没有匹配的任务" : showHistory ? "还没有采集任务" : "当前没有运行中的任务"}
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
                        return isTrackedField(field) && !(isProgramField(field) ? hasProgramResult(field.value) : hasFieldValue(field.value));
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
                资料采集和程序计算字段都计入总进度；程序字段须有数据库结果才算完成。查无资料的核查记录保留为已处理，身份和暂停采集字段单独展示。开始继续未处理项，重新开始保留内容并重置资料核查进度。
              </p>
              {!!currentTask?.cleanupSessions.length && (
                <p className="ep-notice">
                  {currentTask.cleanupSessions.length} 个旧会话待清理。
                  {currentTask.cleanupError}
                </p>
              )}
            </section>
            {modelSettings(currentTask)}
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
