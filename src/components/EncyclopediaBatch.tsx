"use client";

import { useRef, useState } from "react";
import type { ModelSelection } from "@/types/model";
import type {
  BatchAction,
  BatchItemResult,
} from "@/types/encyclopedia";

interface Props {
  selectionUrl: string;
  entries: { id: number }[];
  label?: string;
  disabled?: boolean;
  modelSelection: ModelSelection;
  total: number;
  loading: boolean;
  selected: Set<number>;
  onSelection: (ids: Set<number>) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
}

export default function EncyclopediaBatch(props: Props) {
  const [working, setBusy] = useState(false);
  const busy = working || !!props.disabled;
  const modelReady = !!props.modelSelection.model && !!props.modelSelection.reasoning;
  const [results, setResults] = useState<BatchItemResult[]>([]);
  const [resultPage, setResultPage] = useState(0);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const allPage =
    props.entries.length > 0 &&
    props.entries.every(function selected(entry) {
      return props.selected.has(entry.id);
    });
  const somePage = props.entries.some(function selected(entry) {
    return props.selected.has(entry.id);
  });
  function lock(value: boolean) {
    locked.current = value;
    setBusy(value);
    props.onBusy(value);
  }
  function selectPage(checked: boolean) {
    const ids = new Set(props.selected);
    for (const entry of props.entries) {
      if (checked) ids.add(entry.id);
      else ids.delete(entry.id);
    }
    props.onSelection(ids);
  }
  async function selectAll() {
    if (locked.current || props.disabled) return;
    lock(true);
    setMessage("");
    try {
      const response = await fetch(
        props.selectionUrl,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "全选失败。");
      props.onSelection(new Set(body.ids || []));
      setMessage(
        "已固定选中当时符合条件的 " +
          body.total +
          " 条；后续新增匹配项不会自动加入。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      lock(false);
    }
  }
  async function operate(action: BatchAction) {
    if (locked.current || props.disabled || !props.selected.size) return;
    if (action !== "stop" && !modelReady) return;
    lock(true);
    setResults([]);
    setResultPage(0);
    const ids = [...props.selected].sort(function ascending(a, b) {
      return a - b;
    });
    const collected: BatchItemResult[] = [];
    try {
      setMessage("正在提交 " + ids.length + " 个任务的操作…");
      const response = await fetch("/api/encyclopedia/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, ...props.modelSelection }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "批量请求失败。");
      const items = body.results as BatchItemResult[];
      for (const item of items) collected.push(item);
      setResults(collected);
      setMessage(
        "批量操作已接受。排队任务按全局并发设置执行；正在停止的任务会在后台完成中断和清理。",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setMessage(
        "批量发送中断：" +
          reason +
          "。已返回结果保留；未返回项需刷新核对，未自动重放。",
      );
    } finally {
      // 保留失败、跳过及结果未知的选择，便于处理；成功项取消选择。
      const remaining = new Set(ids);
      for (const item of collected)
        if (item.status === "success") remaining.delete(item.id);
      props.onSelection(remaining);
      try {
        await props.onRefresh();
      } catch {
        /* 操作结果独立于列表刷新。 */
      }
      lock(false);
    }
  }
  const counts = { success: 0, skipped: 0, failed: 0 };
  for (const item of results) counts[item.status]++;
  return (
    <section className="ep-batch" aria-label={props.label || "批量管理词条"} aria-busy={busy}>
      <div className="ep-batch-toolbar">
        <label className="ep-check-label">
          <input
            type="checkbox"
            checked={allPage}
            ref={function mixed(input) {
              if (input) input.indeterminate = somePage && !allPage;
            }}
            disabled={busy || props.loading || !props.entries.length}
            onChange={function change(event) {
              selectPage(event.target.checked);
            }}
          />
          全选本页
        </label>
        <span>已选 {props.selected.size} 条</span>
        <button
          className="ep-button"
          disabled={busy || props.loading || !props.total}
          onClick={function all() {
            void selectAll();
          }}
        >
          全选符合条件的 {props.total} 条（跨页）
        </button>
        <button
          className="ep-button"
          disabled={busy || !props.selected.size}
          onClick={function clear() {
            props.onSelection(new Set());
          }}
        >
          清空选择
        </button>
        <div className="ep-actions">
          <button
            className="ep-button ep-primary"
            disabled={busy || !props.selected.size || !modelReady}
            onClick={function resume() {
              void operate("continue");
            }}
          >
            批量开始
          </button>
          <button
            className="ep-button"
            disabled={busy || !props.selected.size || !modelReady}
            onClick={function restart() {
              void operate("restart");
            }}
          >
            批量重新开始
          </button>
          <button
            className="ep-button"
            disabled={busy || !props.selected.size}
            onClick={function stop() {
              void operate("stop");
            }}
          >
            批量停止
          </button>
          <button
            className="ep-button"
            disabled={busy || !props.selected.size || !modelReady}
            onClick={function configure() { void operate("configure"); }}
          >
            应用模型到所选任务
          </button>
        </div>
      </div>
      <p className="ep-muted">
        批量开始按完成度从高到低入队，与页面排序无关；完成度相同时按 ID 排列。开始只处理未检查字段，跳过已完成词条；重新开始会清零处理进度，保留现有内容。停止会中断并删除会话，保留已处理结果。运行或排队中的词条不会被重复启动。
      </p>
      {message && <p role="status">{message}</p>}
      {results.length > 0 && (
        <details className="ep-batch-results">
          <summary>
            成功 {counts.success} · 跳过 {counts.skipped} · 失败 {counts.failed}
            （查看逐条原因）
          </summary>
          <ul>
            {results
              .slice(resultPage * 100, (resultPage + 1) * 100)
              .map(function result(item) {
                return (
                  <li key={item.id}>
                    <a href={"/encyclopedia/entries/" + item.id}>#{item.id}</a>{" "}
                    ·{" "}
                    {item.status === "success"
                      ? "成功"
                      : item.status === "skipped"
                        ? "跳过"
                        : "失败"}
                    ：{item.reason}
                  </li>
                );
              })}
          </ul>
          {results.length > 100 && (
            <div className="ep-pagination">
              <button
                className="ep-button"
                disabled={resultPage === 0}
                onClick={function previous() {
                  setResultPage(resultPage - 1);
                }}
              >
                上一页结果
              </button>
              <span>
                第 {resultPage + 1} / {Math.ceil(results.length / 100)} 页
              </span>
              <button
                className="ep-button"
                disabled={(resultPage + 1) * 100 >= results.length}
                onClick={function next() {
                  setResultPage(resultPage + 1);
                }}
              >
                下一页结果
              </button>
            </div>
          )}
        </details>
      )}
    </section>
  );
}
