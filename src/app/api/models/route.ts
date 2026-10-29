import { connection } from "next/server";
import { readCachedModelCatalog, refreshModelCatalog } from "@/server/model-catalog";

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

// 只有用户点击更新按钮才会发送这个请求。
export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源不匹配。" }, { status: 403 });
  }

  try {
    const catalog = await refreshModelCatalog();
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
