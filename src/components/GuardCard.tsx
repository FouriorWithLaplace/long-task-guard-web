"use client";

import Link from "next/link";
import GuardLogs from "@/components/GuardLogs";
import GuardStatus from "@/components/GuardStatus";
import type { GuardBulkAction, ManagedGuardSnapshot } from "@/types/guard";

interface GuardCardProps {
  guard: ManagedGuardSnapshot;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  onOperate: (action: GuardBulkAction, ids: string[]) => Promise<void>;
}

export default function GuardCard({ guard, selected, disabled, onToggle, onOperate }: GuardCardProps) {
  const title = guard.sessionTitle || "未命名会话";
  const paused = guard.phase === "paused";
  const locked = disabled || guard.deleting || guard.phase === "stopping";

  function toggle() { onToggle(guard.id); }
  function start() { void onOperate("start", [guard.id]); }
  function pause() { void onOperate("pause", [guard.id]); }

  let borderClass = "border-slate-200";
  if (selected) borderClass = "border-blue-400 ring-2 ring-blue-100";

  return (
    <article aria-label={title} className={"relative min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md " + borderClass}>
      <header className="p-5">
        <div className="flex items-start gap-3">
          <input type="checkbox" aria-label={"选择守护：" + title} checked={selected} disabled={disabled || guard.deleting} onChange={toggle} className="relative z-10 mt-1 h-4 w-4 shrink-0 accent-blue-600" />
          <h2 className="min-w-0 flex-1 text-base font-semibold leading-6">
            <Link href={"/guards/" + guard.id} title={title} className="line-clamp-2 min-h-12 break-words text-slate-900 after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-blue-600">{title}</Link>
          </h2>
        </div>
        <div className="mt-4"><GuardStatus guard={guard} /></div>
        <dl className="mt-4 space-y-2 text-xs leading-5">
          <div className="flex gap-2"><dt className="shrink-0 text-slate-400">模型</dt><dd className="break-all text-slate-700">{guard.settings?.model} · {guard.settings?.reasoning}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-slate-400">会话</dt><dd className="truncate text-slate-500" title={guard.settings?.sessionId}>{guard.settings?.sessionId}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-slate-400">目录</dt><dd className="truncate text-slate-500" title={guard.projectPath}>{guard.projectPath}</dd></div>
        </dl>
      </header>
      <div className="relative z-10"><GuardLogs key={guard.instanceId} logs={guard.logs} compact /></div>
      <footer className="flex min-h-16 items-center justify-between gap-3 px-5 py-3">
        <span className="text-xs text-slate-400">{guard.deleting ? "正在暂停并删除…" : "创建于 " + new Date(guard.createdAt).toLocaleTimeString()}</span>
        <button type="button" onClick={paused ? start : pause} disabled={locked} className="relative z-10 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">{paused ? "开始" : "暂停"}</button>
      </footer>
    </article>
  );
}
