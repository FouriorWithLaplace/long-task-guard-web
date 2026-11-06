import type { QueueDisplay } from "./task-queue.ts";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export const categories = [
  {
    key: "book",
    name: "书籍",
    description: "专业书籍与版本信息",
    mark: "01",
    types: ["book"],
  },
  {
    key: "paper",
    name: "论文",
    description: "研究论文、综述与学位论文",
    mark: "02",
    types: ["paper"],
  },
  {
    key: "journal",
    name: "期刊",
    description: "聚变及相关学科学术期刊",
    mark: "03",
    types: ["journal"],
  },
  {
    key: "device",
    name: "装置",
    description: "聚变实验装置与工程设施",
    mark: "04",
    types: ["device"],
  },
  {
    key: "org",
    name: "机构",
    description: "研究机构、大学与科学组织",
    mark: "05",
    types: ["org"],
  },
  {
    key: "person",
    name: "人物",
    description: "研究与工程领域人物",
    mark: "06",
    types: ["person"],
  },
  {
    key: "lecture",
    name: "课程",
    description: "课程、教学与讲义资料",
    mark: "07",
    types: ["lecture"],
  },
  {
    key: "conference",
    name: "会议",
    description: "学术会议、研讨会与会议资料",
    mark: "08",
    types: ["conference"],
  },
  {
    key: "entry",
    name: "科学词条",
    description: "概念、方法、诊断、物理量、材料、部件与研究计划",
    mark: "09",
    types: [] as string[],
  },
];

export type TaskPhase =
  | "queued"
  | "starting"
  | "running"
  | "retrying"
  | "stopping"
  | "stopped"
  | "completed"
  | "blocked"
  | "error";
export const phaseLabels: Record<TaskPhase, string> = {
  queued: "排队中",
  starting: "启动中",
  running: "正在核查",
  retrying: "等待重试",
  stopping: "正在停止",
  stopped: "已停止",
  completed: "处理完成",
  blocked: "等待处理",
  error: "执行出错",
};
export const taskFilters = [
  { value: "all", label: "全部" },
  { value: "never", label: "未开始" },
  { value: "running", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "partial", label: "完成部分" },
] as const;
export type TaskFilter = (typeof taskFilters)[number]["value"];
// 读取兼容旧后台快照；新任务不会再产生暂停状态。
export type TaskFilterState = TaskPhase | "paused" | "pausing" | {
  phase: TaskPhase | "paused" | "pausing";
  desired: "running" | "paused" | "stopped";
};

export function taskFilterGroup(state?: TaskFilterState | null): TaskFilter {
  if (!state) return "never";
  const phase = typeof state === "string" ? state : state.phase;
  if (phase === "completed") return "completed";
  if (phase === "paused" || phase === "pausing" || phase === "stopped") return "partial";
  if (phase === "blocked" || phase === "error") {
    if (typeof state !== "string" && state.desired === "running") return "running";
    return "partial";
  }
  return "running";
}
export type StartMode = "continue" | "restart";
export type BatchAction = StartMode | "stop" | "configure";
export interface ProgressCounts {
  filled: number;
  checked: number;
  total: number;
  percent: number;
}
export interface BatchItemResult {
  id: number;
  status: "success" | "skipped" | "failed";
  reason: string;
}
export type FieldOutcome =
  | "verified"
  | "tentative"
  | "not_found"
  | "not_applicable"
  | "conflict"
  | "blocked";
export const outcomeLabels: Record<FieldOutcome, string> = {
  verified: "有据核实",
  tentative: "暂定采用",
  not_found: "未找到",
  not_applicable: "不适用",
  conflict: "来源冲突",
  blocked: "规则限制",
};

export interface Evidence {
  uri: string;
  title: string;
  snapshot: string;
  excerpt: string;
  locator: string;
  sourceId?: number;
  documentPath?: string;
  sourceDate?: string;
}
export interface FieldResult {
  field: string;
  outcome: FieldOutcome;
  value: Json;
  reason: string;
  nextCondition: string;
  evidence: Evidence[];
  candidates: Json[];
  checkedAt: string;
  changed: boolean;
  readback: boolean;
  operationId?: string;
}
export interface FieldDefinition {
  key: string;
  label: string;
  group: string;
  storage: string;
  fieldKey: string;
  column: string;
  table: string;
  value: Json;
  valueType: string | null;
  description: string;
  rules: Record<string, Json>;
  writable: boolean;
}
export interface EntrySummary {
  id: number;
  name: string;
  nameEn: string;
  type: string;
  typeName: string;
  state: string;
  version: number;
  task?: EntryTask;
  progress?: ProgressCounts;
}
export interface OriginalDocument {
  path: string;
  sha256: string;
  size: number;
  blob_path: string;
  localPath: string;
}
export interface EntryDetail extends EntrySummary {
  fields: FieldDefinition[];
  originals: OriginalDocument[];
  evidence: {
    sourceId: number;
    field: string;
    title: string;
    uri: string;
    excerpt: string;
    locator: string;
  }[];
  dictionaryHash: string;
}
export interface EntryTask {
  // 仅展示响应附带的全局队列位置，不改变任务的持久化状态。
  displayQueue?: QueueDisplay;
  displayProgress?: {
    filled: number | undefined;
    checked: number;
    total: number;
    percent: number;
    verified: number;
    pendingReview: number;
    missing: number;
    changed: number;
  };
  entityId: number;
  name: string;
  type: string;
  phase: TaskPhase;
  desired: "running" | "stopped";
  mode: StartMode;
  processedFields: string[];
  filled: number;
  slotHeld: boolean;
  queuedAt: string;
  queueOrder?: number;
  runId: string;
  attempt: number;
  generation: number;
  failures: number;
  noProgress: number;
  sessionId: string | null;
  cleanupSessions: string[];
  cleanupError: string;
  model: string;
  reasoning: string;
  scope: string[];
  dictionaryHash: string;
  skillHash: string;
  results: Record<string, FieldResult>;
  startedAt: string;
  updatedAt: string;
  nextRetryAt: string | null;
  message: string;
  unconfirmed: number;
}

// 热更新期间可能收到旧后台的任务；仅在缺少新字段时从已确认结果推导进度。
// 显式的空数组表示“重新处理”的进度已清零，不能用旧结果补回。
export function processedFieldKeys(task?: EntryTask | null): string[] {
  if (!task) return [];
  if (Array.isArray(task.processedFields)) return task.processedFields;
  return Object.keys(task.results).filter(function confirmed(key) {
    return task.results[key].readback;
  });
}

export function taskProgress(task: EntryTask) {
  if (task.displayProgress) return task.displayProgress;
  const processed = new Set(processedFieldKeys(task));
  let checked = 0;
  let verified = 0;
  let pendingReview = 0;
  let missing = 0;
  let changed = 0;
  for (const key of task.scope) {
    const result = task.results[key];
    if (!result || !processed.has(key)) continue;
    if (result.readback) checked++;
    if (result.outcome === "verified") verified++;
    if (result.outcome === "tentative" || result.outcome === "conflict")
      pendingReview++;
    if (result.value === null && result.outcome !== "not_applicable") missing++;
    if (result.changed) changed++;
  }
  const percent = task.scope.length
    ? Math.floor((checked * 100) / task.scope.length)
    : 0;
  return {
    filled: Number.isFinite(task.filled) ? task.filled : undefined,
    checked,
    total: task.scope.length,
    percent,
    verified,
    pendingReview,
    missing,
    changed,
  };
}

// 有值不等于已核查；0 和 false 是有效内容，空字符串、空数组、空对象不是。
export function hasFieldValue(value: Json): boolean {
  if (value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function fieldProgress(
  fields: FieldDefinition[],
  task?: EntryTask | null,
): ProgressCounts {
  const processed = new Set(processedFieldKeys(task));
  let total = 0;
  let filled = 0;
  let checked = 0;
  for (const field of fields) {
    if (!field.writable) continue;
    total++;
    if (hasFieldValue(field.value)) filled++;
    if (processed.has(field.key) && task?.results[field.key]?.readback)
      checked++;
  }
  return { filled, checked, total, percent: total ? Math.floor(checked * 100 / total) : 0 };
}
