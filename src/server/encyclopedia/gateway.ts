import { checkGuardOrigin, guardErrorResponse } from "../guard-http.ts";
import { viewRequest } from "./view-http.ts";

export async function encyclopediaGateway(request: Request, segments: string[]) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const view = viewRequest(request, segments);
    if (view) return view;
    const endpoint = process.env.ENCYCLOPEDIA_BACKEND_URL;
    const token = process.env.ENCYCLOPEDIA_BACKEND_TOKEN;
    if (!endpoint || !token) throw Object.assign(new Error("后台服务未启动，请使用 npm start 或 npm run dev 启动工程。"), { status: 503 });
    const source = new URL(request.url);
    const host = request.headers.get("host");
    if (host) source.host = host;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("connection");
    headers.set("x-panel-token", token);
    headers.set("x-panel-url", source.href);
    const init: RequestInit & { duplex?: string } = { method: request.method, headers, signal: request.signal };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }
    let response: Response;
    try {
      response = await fetch(endpoint + source.pathname + source.search, init);
    } catch (error) {
      request.signal.throwIfAborted();
      // 只重试读取请求，避免重复提交任务。导出下载链接也允许重试。
      if (request.method !== "GET" && request.method !== "HEAD") throw error;
      response = await fetch(endpoint + source.pathname + source.search, init);
    }
    const responseHeaders = new Headers(response.headers);
    for (const name of ["connection", "transfer-encoding", "keep-alive", "content-encoding", "content-length"]) responseHeaders.delete(name);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    if (!request.signal.aborted && error instanceof TypeError && error.message === "fetch failed") {
      const cause = error.cause as { code?: string; message?: string } | undefined;
      console.error("百科后台连接失败", cause?.code, cause?.message);
      return Response.json({ error: "后台连接暂时中断，请稍后重试。" }, {
        status: 502, headers: { "Cache-Control": "no-store" },
      });
    }
    return guardErrorResponse(error);
  }
}
