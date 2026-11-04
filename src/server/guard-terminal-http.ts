import { checkGuardOrigin, guardErrorResponse, guardResponseHeaders, readGuardObject } from "./guard-http";
import type { GuardTerminalService } from "./guard-terminal-service";

// 终端有独立的生命周期；不通过这些接口开始、暂停任务或发送模型提示词。
export async function terminalRequest(request: Request, guardId: string, service: GuardTerminalService): Promise<Response> {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    if (request.method === "GET") {
      const viewerId = new URL(request.url).searchParams.get("viewer");
      if (!viewerId) throw new Error("缺少终端显示 ID。");
      return new Response(service.stream(guardId, viewerId, request.signal), {
        headers: { ...guardResponseHeaders, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" },
      });
    }
    const body = readGuardObject(await request.json());
    if (request.method === "POST" && body.action === "open") {
      return Response.json(service.create(guardId, body.cols, body.rows), { headers: guardResponseHeaders });
    }
    if (typeof body.viewerId !== "string") throw new Error("缺少终端显示 ID。");
    if (request.method === "POST" && body.action === "resize") {
      service.resize(guardId, body.viewerId, body.cols, body.rows);
    } else if (request.method === "DELETE") {
      service.remove(guardId, body.viewerId);
    } else {
      throw new Error("不支持的终端操作。");
    }
    return new Response(null, { status: 204, headers: guardResponseHeaders });
  } catch (error) { return guardErrorResponse(error); }
}
