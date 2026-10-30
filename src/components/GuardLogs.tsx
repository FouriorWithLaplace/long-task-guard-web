"use client";

import { useEffect, useId, useRef, useState } from "react";
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

export default function GuardLogs({ logs, compact = false }: { logs: GuardLog[]; compact?: boolean }) {
  const headingId = useId();
  const [filter, setFilter] = useState("all");
  const [clearedThrough, setClearedThrough] = useState(0);
  const output = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);

  useEffect(function watchLogInteraction() {
    if (!output.current) return;
    const element = output.current;

    let resumeTimer: number | undefined;
    let mouseHeld = false;
    let touchHeld = false;

    function clearResumeTimer() {
      window.clearTimeout(resumeTimer);
      resumeTimer = undefined;
    }

    function resumeFollowing() {
      clearResumeTimer();
      followOutput.current = true;
      element.scrollTop = element.scrollHeight;
    }

    function pauseFollowing() {
      followOutput.current = false;
      clearResumeTimer();
      // 按住滚动条或触摸屏时不抢位置，松开后才开始计时。
      if (!mouseHeld && !touchHeld) {
        resumeTimer = window.setTimeout(resumeFollowing, 5000);
      }
    }

    function handleScroll() {
      // 程序滚动和日志更新不重置计时，只检查是否手动回到了底部。
      if (followOutput.current || mouseHeld || touchHeld) return;
      const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distanceToBottom <= 1) resumeFollowing();
    }

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;
      mouseHeld = true;
      pauseFollowing();
    }

    function handleMouseUp(event: MouseEvent) {
      if (event.button !== 0 || !mouseHeld) return;
      mouseHeld = false;
      pauseFollowing();
      handleScroll();
    }

    function handleTouchStart() {
      touchHeld = true;
      pauseFollowing();
    }

    function handleTouchEnd(event: TouchEvent) {
      touchHeld = event.targetTouches.length > 0;
      pauseFollowing();
      handleScroll();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (scrollKeys.includes(event.key)) pauseFollowing();
    }

    function handleWindowBlur() {
      if (!mouseHeld && !touchHeld) return;
      mouseHeld = false;
      touchHeld = false;
      pauseFollowing();
    }

    element.addEventListener("wheel", pauseFollowing, { passive: true });
    element.addEventListener("scroll", handleScroll);
    element.addEventListener("mousedown", handleMouseDown);
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    element.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    // 热更新也会重新运行 effect，恢复当前日志框的跟随状态。
    resumeFollowing();

    return function stopWatchingLogInteraction() {
      clearResumeTimer();
      element.removeEventListener("wheel", pauseFollowing);
      element.removeEventListener("scroll", handleScroll);
      element.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      element.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(function scrollToLatest() {
    if (output.current && followOutput.current) output.current.scrollTop = output.current.scrollHeight;
  }, [logs, filter, clearedThrough]);

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
    <section aria-labelledby={headingId} className={compact ? "overflow-hidden border-y border-slate-100 bg-white" : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"}>
      <div className={compact ? "px-5 py-3" : "flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"}>
        <div>
          <h2 id={headingId} className={compact ? "text-xs font-medium text-slate-500" : "text-base font-semibold"}>{compact ? "实时消息" : "运行记录"}</h2>
          {!compact && <p className="mt-1 text-sm text-slate-500">每一步只显示简短进展和关键状态。</p>}
        </div>
        {!compact && <div className="flex flex-wrap items-center gap-3">
          <select aria-label="日志类型" value={filter} onChange={handleFilterChange} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <option value="all">全部类型</option><option value="status">状态</option><option value="message">进展</option><option value="error">错误</option>
          </select>
          <button type="button" onClick={handleClear} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">清空当前显示</button>
        </div>}
      </div>
      <div className={compact ? "bg-slate-950" : "mx-5 mb-5 overflow-hidden rounded-xl bg-slate-950 sm:mx-6 sm:mb-6"}>
        {!compact && <div className="border-b border-white/10 px-4 py-3 text-xs text-slate-400">日志输出 · 最近 500 条</div>}
        <div ref={output} tabIndex={0} role="log" aria-label="运行日志" className={(compact ? "h-64 space-y-4" : "h-96 space-y-5") + " overflow-auto p-4 text-sm leading-6"}>
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
