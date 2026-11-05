import EncyclopediaPanel from "@/components/EncyclopediaPanel";
import { Suspense } from "react";
async function EntryContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <EncyclopediaPanel key={id} view={{ kind: "entry", id: Number(id) }} />
  );
}
export default function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="ep-app">
          <p className="ep-loading">正在打开词条…</p>
        </main>
      }
    >
      <EntryContent params={params} />
    </Suspense>
  );
}
