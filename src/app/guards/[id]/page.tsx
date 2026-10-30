"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import GuardEditor from "@/components/GuardEditor";

function GuardDetail() {
  const params = useParams<{ id: string }>();
  return <GuardEditor key={params.id} guardId={params.id} />;
}

export default function GuardDetailPage() {
  return <Suspense fallback={<p className="p-8 text-sm text-slate-500">正在读取守护…</p>}><GuardDetail /></Suspense>;
}
