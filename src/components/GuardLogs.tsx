"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { GuardLog } from "@/types/guard";

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

  const visible = logs.filter(function include(log) {
    return log.id > clearedThrough && (filter === "all" || log.kind === filter);
  });

  return (
    <section aria-labelledby="logs-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h2 id="logs-heading" className="text-base font-semibold">运行记录</h2>
          <p className="mt-1 text-sm text-slate-500">查看真实状态、发送内容、Codex 回复和工具执行记录。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="日志类型" value={filter} onChange={handleFilterChange} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <option value="all">全部类型</option><option value="status">状态</option><option value="message">对话</option><option value="error">错误</option>
          </select>
          <button type="button" onClick={handleClear} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">清空当前显示</button>
        </div>
      </div>
      <div className="mx-5 mb-5 overflow-hidden rounded-xl bg-slate-950 sm:mx-6 sm:mb-6">
        <div className="border-b border-white/10 px-4 py-3 text-xs text-slate-400">日志输出 · 最近 500 条</div>
        <div ref={output} onScroll={handleScroll} role="log" aria-label="运行日志" className="h-96 space-y-5 overflow-auto p-4 font-mono text-sm leading-6">
          {visible.length === 0 && <p className="text-slate-500">暂无运行记录。</p>}
          {visible.map(function renderLog(log) {
            let label = "状态";
            let color = "text-blue-400";
            if (log.role === "user") { label = "用户"; color = "text-emerald-400"; }
            if (log.role === "assistant") { label = "Codex"; color = "text-violet-400"; }
            if (log.role === "tool") { label = "工具"; color = "text-amber-400"; }
            if (log.kind === "error") { label = "中断"; color = "text-red-400"; }
            return (
              <div key={log.id} className="min-w-0">
                <div className="flex flex-wrap gap-3 text-xs">
                  <time dateTime={log.time} className="text-slate-500">{new Date(log.time).toLocaleTimeString()}</time>
                  <span className={color}>{label}</span>
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
