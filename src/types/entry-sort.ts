export const entrySortOptions = [
  { value: "default", label: "默认排序" },
  { value: "name", label: "首字母（拼音 / A–Z）" },
  { value: "progress", label: "完成度（从高到低）" },
] as const;

export type EntrySort = (typeof entrySortOptions)[number]["value"];

export const taskSortOptions = [
  ...entrySortOptions,
  { value: "execution", label: "执行顺序" },
] as const;
export type TaskSort = (typeof taskSortOptions)[number]["value"];

export function readTaskSort(value: string): TaskSort {
  if (value === "execution") return value;
  return readEntrySort(value);
}

export function readEntrySort(value: string): EntrySort {
  for (const option of entrySortOptions) {
    if (option.value === value) return option.value;
  }
  throw new Error("不支持的排序方式。");
}

// 比较实际比例，避免界面百分比取整后把不同完成度视为相同。
export function completionRatio(progress?: { checked: number; total: number } | null): number {
  if (!progress || progress.total <= 0) return 0;
  return progress.checked / progress.total;
}
