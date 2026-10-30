"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { GuardLog } from "@/types/guard";

function summarizeProgress(message: string): string {
  // 直接使用原消息的第一句，不额外调用模型生成摘要。
  const beforeCode = message.split("```", 1)[0];
  const firstLine = beforeCode.trim().split(/\r?\n/, 1)[0];
  let summary = firstLine
    .replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
  const sentenceEnd = summary.search(/[。！？]|[.!?](?=\s|$)/);

  if (sentenceEnd >= 0) summary = summary.slice(0, sentenceEnd + 1);
  if (summary.length > 160) summary = summary.slice(0, 160) + "…";
  return summary;
}

export default function GuardLogs({ logs }: { logs: GuardLog[] }) {
  const [filter, setFilter] = useState("all");
  const [clearedThrough, setClearedThrough] = useState(0);
  const output = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);

  useEffect(function scrollToLatest() {
    if (output.current && followOutput.current) output.current.scrollTop = output.current.scrollHeight;
  }, [logs, filter, clearedThrough]);

  function handleScroll() {
    const element = output.current;
    if (element) followOutput.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) { setFilter(event.target.value); }
  function handleClear() {
    if (logs.length > 0) setClearedThrough(logs[logs.length - 1].id);
  }

  const visible: GuardLog[] = [];
  for (const log of logs) {
    if (log.id <= clearedThrough) continue;
    if (log.role === "tool" && !log.activityStatus) continue;
    if (filter !== "all" && log.kind !== filter) continue;
    const summary = summarizeProgress(log.text);
    if (summary !== "") visible.push({ ...log, text: summary });
  }

  return (
    <section aria-labelledby="logs-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 id="logs-heading" className="text-base font-semibold">运行记录</h2>
          <p className="mt-1 text-sm text-slate-500">每一步只显示简短进展和关键状态。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="日志类型" value={filter} onChange={handleFilterChange} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <option value="all">全部类型</option><option value="status">状态</option><option value="message">进展</option><option value="error">错误</option>
          </select>
          <button type="button" onClick={handleClear} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">清空当前显示</button>
        </div>
      </div>
      <div className="mx-5 mb-5 overflow-hidden rounded-xl bg-slate-950 sm:mx-6 sm:mb-6">
        <div className="border-b border-white/10 px-4 py-3 text-xs text-slate-400">日志输出 · 最近 500 条</div>
        <div ref={output} onScroll={handleScroll} role="log" aria-label="运行日志" className="h-96 space-y-5 overflow-auto p-4 text-sm leading-6">
          {visible.length === 0 && <p className="text-slate-500">暂无运行记录。</p>}
          {visible.map(function renderLog(log) {
            let label = "状态";
            let color = "text-blue-400";
            if (log.role === "user") { label = "发送"; color = "text-emerald-400"; }
            if (log.role === "assistant") { label = "进展"; color = "text-violet-400"; }
            if (log.role === "tool") { label = "活动"; color = "text-cyan-400"; }
            if (log.kind === "error") { label = "中断"; color = "text-red-400"; }
            let activityLabel = "";
            let activityColor = "text-slate-400";
            if (log.activityStatus === "running") { activityLabel = "进行中"; activityColor = "text-cyan-300"; }
            if (log.activityStatus === "completed") { activityLabel = "已完成"; activityColor = "text-emerald-400"; }
            if (log.activityStatus === "failed") { activityLabel = "失败"; activityColor = "text-red-400"; }
            if (log.activityStatus === "declined") activityLabel = "已拒绝";
            if (log.activityStatus === "interrupted") activityLabel = "已中断";
            if (log.activityStatus === "ended") activityLabel = "已结束";
            return (
              <div key={log.id} className="min-w-0">
                <div className="flex flex-wrap gap-3 text-xs">
                  <time dateTime={log.time} className="text-slate-500">{new Date(log.time).toLocaleTimeString()}</time>
                  <span className={color}>{label}</span>
                  {activityLabel && <span className={activityColor}>{activityLabel}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-300 [overflow-wrap:anywhere]">{log.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
