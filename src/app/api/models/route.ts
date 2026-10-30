import { connection } from "next/server";
import { readCachedModelCatalog, refreshModelCatalog } from "@/server/model-catalog";
import { checkGuardOrigin } from "@/server/guard-http";

function errorResponse(error: unknown) {
  let message = "读取模型目录失败。";

  if (error instanceof Error) {
    message = error.message;
  }

  return Response.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

// 打开或刷新页面只读磁盘缓存，缓存为空时也不自动启动 Codex。
export async function GET() {
  await connection();

  try {
    const catalog = await readCachedModelCatalog();
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

// 页面点击更新或 API 客户端显式刷新时才查询 Codex。
export async function POST(request: Request) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;

  try {
    const catalog = await refreshModelCatalog();
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
