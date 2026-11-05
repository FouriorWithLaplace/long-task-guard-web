import type { EntryTask, FieldDefinition, Json, ProgressCounts } from "@/types/encyclopedia";
import EncyclopediaContent from "./EncyclopediaContent";
import { outcomeLabels, phaseLabels, processedFieldKeys, taskFilterGroup, taskFilters, taskProgress } from "@/types/encyclopedia";

export function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
}
export function displayValue(value: Json): string {
  if (value === null) return "尚未填写";
  if (typeof value === "string") return value === "" ? "（空字符串）" : value;
  return JSON.stringify(value, null, 2);
}
export function TaskStatus({ task }: { task?: EntryTask | null }) {
  const group = taskFilterGroup(task);
  const label = taskFilters.find(function match(item) { return item.value === group; })?.label;
  if (!task) return <span className="ep-badge">{label}</span>;
  return (
    <span className={"ep-badge ep-status-" + task.phase} title={phaseLabels[task.phase]}>
      <span className="ep-dot" />
      {label}
    </span>
  );
}
export function TaskProgress({ task, counts }: { task?: EntryTask | null; counts?: ProgressCounts }) {
  const progress = counts || (task
    ? taskProgress(task)
    : { filled: 0, checked: 0, total: 0, percent: 0 });
  return (
    <div className="ep-progress-wrap">
      <div className="ep-progress-label">
        <span>已填充</span>
        <strong>{progress.filled ?? "—"} / {progress.total}</strong>
      </div>
      <div className="ep-progress-label">
        <span>已处理</span>
        <strong>
          {progress.checked} / {progress.total}
        </strong>
      </div>
      <div
        className="ep-progress"
        role="progressbar"
        aria-label="字段处理进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <span style={{ width: progress.percent + "%" }} />
      </div>
    </div>
  );
}
export function CategoryIcon({ type }: { type: string }) {
  const shapes: Record<string, React.ReactNode> = {
    book: (
      <path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3zM21 4h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z" />
    ),
    paper: <path d="M5 2h10l5 5v15H5zM15 2v6h5M9 12h7M9 16h7M9 19h4" />,
    journal: <path d="M4 3h17v19H4zM8 3v19M11 8h7M11 12h7M11 17h5" />,
    device: (
      <>
        <ellipse cx="12" cy="12" rx="10" ry="5" />
        <ellipse cx="12" cy="12" rx="5" ry="10" transform="rotate(35 12 12)" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    org: (
      <path d="M2 22h21M4 22V8h8v14M12 12h8v10M7 12h2M7 16h2M15 16h2M7 8V3h10v9" />
    ),
    person: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M3 22v-3a9 9 0 0 1 18 0v3" />
      </>
    ),
    lecture: <path d="m1 8 11-6 11 6-11 6zM6 11v7c4 4 8 4 12 0v-7M23 8v12" />,
    entry: (
      <>
        <circle cx="12" cy="12" r="4" />
        <circle cx="3" cy="3" r="2" />
        <circle cx="21" cy="4" r="2" />
        <circle cx="21" cy="21" r="2" />
        <circle cx="3" cy="21" r="2" />
        <path d="m5 5 4 4m6 0 4-4m-4 10 4 4M5 19l4-4" />
      </>
    ),
  };
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[type] || shapes.entry}
    </svg>
  );
}
export function FieldRow({
  field,
  task,
  entityId,
}: {
  field: FieldDefinition;
  task?: EntryTask | null;
  entityId?: number;
}) {
  const result = task?.results[field.key];
  const processed = processedFieldKeys(task).includes(field.key);
  return (
    <details className="ep-field">
      <summary>
        <div>
          <strong>{field.label}</strong>
          <span className="ep-field-group">{field.group}</span>
        </div>
        <div
          className={
            "ep-field-value " + (field.value === null ? "ep-empty-value" : "")
          }
        >
          {displayValue(field.value)}
        </div>
        <span
          className={
            "ep-badge " +
            (result?.outcome === "verified" ? "ep-status-completed" : "")
          }
        >
          {!field.writable ? "只读 · 不计入进度" : !processed
            ? result ? "待重新处理" : "未处理"
            : result ? outcomeLabels[result.outcome] : "未处理"}
        </span>
        <span className="ep-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="ep-field-expanded">
        <p className="ep-kicker">数据库当前值</p>
        <EncyclopediaContent value={field.value} field={field.fieldKey} entityId={entityId||task?.entityId}/>
        <p className="ep-muted">
          {field.description}
          {!field.writable && " 此字段不允许自动修改。"}
        </p>
        {result && (
          <div className="ep-evidence">
            <p className="ep-kicker">
              最近核查结果 · {formatDate(result.checkedAt)}
            </p>
            <p>{result.reason}</p>
            {result.nextCondition && (
              <p>
                <strong>后续条件：</strong>
                {result.nextCondition}
              </p>
            )}
            <p className="ep-muted">
              {result.changed ? "已修改" : "保留现值"} ·{" "}
              {result.readback ? "实值已核对" : "待回读"}
            </p>
            {result.evidence.map(function source(item, index) {
              return (
                <div className="ep-source" key={index}>
                  <strong>{item.title}</strong>
                  <p>
                    {/^https?:\/\//.test(item.uri) ? (
                      <a href={item.uri} target="_blank" rel="noreferrer">
                        {item.uri} ↗
                      </a>
                    ) : (
                      item.uri
                    )}
                  </p>
                  <blockquote>{item.excerpt}</blockquote>
                  <p className="ep-muted">{item.locator}</p>
                </div>
              );
            })}
            {!!result.candidates.length && (
              <details>
                <summary>其他候选</summary>
                <pre>{JSON.stringify(result.candidates, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
        <details className="ep-rule">
          <summary>字段规则与标识</summary>
          <p>{field.key}</p>
          <pre>{JSON.stringify(field.rules, null, 2)}</pre>
        </details>
      </div>
    </details>
  );
}
