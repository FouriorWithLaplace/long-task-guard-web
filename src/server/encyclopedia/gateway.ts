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
    const response = await fetch(endpoint + source.pathname + source.search, init);
    const responseHeaders = new Headers(response.headers);
    for (const name of ["connection", "transfer-encoding", "keep-alive", "content-encoding", "content-length"]) responseHeaders.delete(name);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) { return guardErrorResponse(error); }
}
