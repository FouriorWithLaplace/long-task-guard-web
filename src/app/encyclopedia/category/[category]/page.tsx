import EncyclopediaPanel from "@/components/EncyclopediaPanel";
import { Suspense } from "react";
async function CategoryContent({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return (
    <EncyclopediaPanel key={category} view={{ kind: "category", category }} />
  );
}
export default function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="ep-app">
          <p className="ep-loading">正在打开分类…</p>
        </main>
      }
    >
      <CategoryContent params={params} />
    </Suspense>
  );
}
