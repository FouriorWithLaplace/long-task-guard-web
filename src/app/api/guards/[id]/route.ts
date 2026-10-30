import { connection } from "next/server";
import { getGuardManager, startGuard } from "@/server/guard-service";
import { checkGuardOrigin, guardErrorResponse, guardResponseHeaders, readGuardObject, readGuardSettings } from "@/server/guard-http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  await connection();
  try {
    const { id } = await context.params;
    return Response.json(getGuardManager().get(id), { headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const { id } = await context.params;
    const body = readGuardObject(await request.json());
    const manager = getGuardManager();
    let guard;
    if (body.action === "start") {
      const settings = body.settings === undefined ? undefined : readGuardSettings(body.settings);
      guard = await startGuard(id, settings);
    } else if (body.action === "pause") {
      guard = await manager.pause(id);
    } else if (body.action === "respond" && (typeof body.id === "string" || typeof body.id === "number")) {
      guard = manager.respond(id, body.id, readGuardObject(body.response));
    } else {
      throw new Error("无效的守护操作。");
    }
    return Response.json(guard, { headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const { id } = await context.params;
    await getGuardManager().remove(id);
    return new Response(null, { status: 204, headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
