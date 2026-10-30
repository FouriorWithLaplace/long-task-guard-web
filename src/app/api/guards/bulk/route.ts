import { operateGuards } from "@/server/guard-service";
import { checkGuardOrigin, guardErrorResponse, guardResponseHeaders, readGuardObject } from "@/server/guard-http";

export async function POST(request: Request) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const body = readGuardObject(await request.json());
    if (body.action !== "start" && body.action !== "pause" && body.action !== "delete") throw new Error("无效的批量操作。");
    if (!Array.isArray(body.ids) || body.ids.length === 0) throw new Error("请先选择守护。");
    const ids: string[] = [];
    for (const id of body.ids) {
      if (typeof id !== "string" || id === "") throw new Error("守护 ID 必须是非空字符串。");
      ids.push(id);
    }
    const results = await operateGuards(body.action, ids);
    return Response.json({ results: results }, { headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
