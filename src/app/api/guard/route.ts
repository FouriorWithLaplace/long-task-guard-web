import { connection } from "next/server";
import { getGuardRunner, startGuard } from "@/server/guard-service";
import type { GuardSettings } from "@/types/guard";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  await connection();
  const snapshot = getGuardRunner().snapshot();
  const query = new URL(request.url).searchParams;
  const revision = query.get("revision");

  if (query.get("instanceId") === snapshot.instanceId && revision !== null && Number(revision) === snapshot.revision) {
    return new Response(null, { status: 204, headers: headers });
  }
  return Response.json(snapshot, { headers: headers });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源不匹配。" }, { status: 403, headers: headers });
  }

  try {
    const body = await request.json();
    const runner = getGuardRunner();

    if (body.action === "pause") {
      return Response.json(await runner.pause(), { headers: headers });
    }

    if (body.action === "respond" && (typeof body.id === "string" || typeof body.id === "number")) {
      return Response.json(runner.respond(body.id, body.response || {}), { headers: headers });
    }

    if (body.action !== "start" || !body.settings) throw new Error("无效的守护操作。" );
    const settings = body.settings as GuardSettings;
    const fields = ["sessionId", "model", "reasoning", "startMessage", "retryMessage", "completeMessage"] as const;
    for (const field of fields) {
      if (typeof settings[field] !== "string") throw new Error("守护设置不完整。" );
    }

    return Response.json(await startGuard(settings), { headers: headers });
  } catch (error) {
    let message = "无法执行守护操作。";
    if (error instanceof Error) message = error.message;
    return Response.json({ error: message }, { status: 400, headers: headers });
  }
}
