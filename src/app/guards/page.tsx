"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import GuardCard from "@/components/GuardCard";
import { useGuards } from "@/hooks/useGuards";
import type { GuardBulkAction, GuardOperationResult } from "@/types/guard";

const buttonClass = "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

export default function GuardsPage() {
  const { guards, loaded, error } = useGuards();
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  const busyRef = useRef(false);
  const selectable = guards.filter(function available(guard) { return !guard.deleting; });
  const selected = selectable.filter(function chosen(guard) { return selectedIds.has(guard.id); });
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const activeCount = guards.filter(function active(guard) { return guard.phase !== "paused"; }).length;

  function toggleGuard(id: string) {
    setSelectedIds(function update(previous) {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      for (const guard of selectable) next.add(guard.id);
      setSelectedIds(next);
    }
  }

  async function operate(action: GuardBulkAction, ids: string[]) {
    if (busyRef.current || ids.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    setFailures([]);
    try {
      const response = await fetch("/api/guards/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action, ids: ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "批量操作失败。");
      const results = data.results as GuardOperationResult[];
      const failed: string[] = [];
      const removed = new Set<string>();
      let successCount = 0;
      for (const result of results) {
        if (result.success) {
          successCount++;
          if (action === "delete") removed.add(result.id);
        } else {
          const guard = guards.find(function match(item) { return item.id === result.id; });
          failed.push((guard?.sessionTitle || result.id) + "：" + result.error);
        }
      }
      let label = "开始";
      if (action === "pause") label = "暂停";
      if (action === "delete") label = "删除";
      setNotice(label + "操作完成：成功 " + successCount + " 个，失败 " + failed.length + " 个。");
      setFailures(failed);
      if (removed.size > 0) {
        setSelectedIds(function removeDeleted(previous) {
          const next = new Set(previous);
          for (const id of removed) next.delete(id);
          return next;
        });
      }
    } catch (failure) {
      let message = "批量操作失败。";
      if (failure instanceof Error) message = failure.message;
      setFailures([message]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function selectedGuardIds(): string[] {
    return selected.map(function getId(guard) { return guard.id; });
  }

  function startSelected() { void operate("start", selectedGuardIds()); }
  function pauseSelected() { void operate("pause", selectedGuardIds()); }
  function deleteSelected() { void operate("delete", selectedGuardIds()); }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 [color-scheme:light] sm:px-6">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-blue-600">← 首页</Link>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">守护总览</h1>
            <p className="mt-2 text-sm text-slate-500">共 {guards.length} 个守护 · {activeCount} 个执行中 · {guards.length - activeCount} 个已暂停</p>
          </div>
          <Link href="/guards/new" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">＋ 新建守护</Link>
        </header>

        <section aria-label="批量操作" className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!loaded || busy || selectable.length === 0} className="h-4 w-4 accent-blue-600" />
            全选
          </label>
          <span className="mr-auto text-sm text-slate-500">已选 {selected.length} 个</span>
          <button type="button" onClick={startSelected} disabled={!loaded || busy || selected.length === 0} className={buttonClass}>批量开始</button>
          <button type="button" onClick={pauseSelected} disabled={!loaded || busy || selected.length === 0} className={buttonClass}>批量暂停</button>
          <button type="button" onClick={deleteSelected} disabled={!loaded || busy || selected.length === 0} className={buttonClass + " border-red-200 text-red-600 hover:bg-red-50"}>批量删除</button>
          {busy && <span role="status" className="w-full text-sm text-blue-600">正在处理所选守护…</span>}
        </section>

        {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>}
        {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
        {failures.length > 0 && <ul role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{failures.map(function renderFailure(failure, index) { return <li key={index}>{failure}</li>; })}</ul>}

        {!loaded && guards.length === 0 && !error && <p role="status" className="py-16 text-center text-sm text-slate-500">正在读取守护…</p>}
        {loaded && guards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
            <p className="text-lg font-semibold">还没有守护</p>
            <p className="mt-2 text-sm text-slate-500">新建守护并点击开始执行后，会显示在这里。</p>
            <Link href="/guards/new" className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">新建第一个守护</Link>
          </div>
        )}
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {guards.map(function renderGuard(guard) {
            return <GuardCard key={guard.id} guard={guard} selected={selectedIds.has(guard.id)} disabled={busy || !loaded} onToggle={toggleGuard} onOperate={operate} />;
          })}
        </div>
      </div>
    </main>
  );
}
