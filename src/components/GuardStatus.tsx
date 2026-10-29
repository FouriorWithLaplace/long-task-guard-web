"use client";

import type { GuardSnapshot } from "@/types/guard";

export default function GuardStatus({ guard }: { guard: GuardSnapshot }) {
  let label = "已暂停";
  let dotClass = "bg-slate-400";
  if (guard.phase === "starting") label = "正在启动";
  if (guard.phase === "running") label = "正在执行";
  if (guard.phase === "needsInput") label = "等待你的操作";
  if (guard.phase === "stopping") label = "正在暂停";
  if (guard.phase !== "paused") dotClass = "bg-blue-500";

  if (guard.phase === "waiting") {
    label = "正在续发";
    if (guard.nextMessage === "retry") label = "正在重试";
  }

  return (
    <div role="status" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
      <span className={"h-2 w-2 rounded-full " + dotClass} />
      {label}
    </div>
  );
}
