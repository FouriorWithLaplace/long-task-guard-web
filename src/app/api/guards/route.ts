import { connection } from "next/server";
import { createGuard, getGuardManager } from "@/server/guard-service";
import { checkGuardOrigin, guardErrorResponse, guardResponseHeaders, readGuardObject, readGuardSettings, readNewSessionOptions } from "@/server/guard-http";

export async function GET() {
  await connection();
  return Response.json(getGuardManager().snapshot(), { headers: guardResponseHeaders });
}

export async function POST(request: Request) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const body = readGuardObject(await request.json());
    const guard = await createGuard(readGuardSettings(body.settings), readNewSessionOptions(body.newSession));
    return Response.json(guard, { status: 201, headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
