import { connection } from "next/server";
import { getGuardRunner } from "@/server/guard-service";
import { createGuardEventStream } from "@/server/guard-events";

export async function GET(request: Request) {
  await connection();
  const stream = createGuardEventStream(getGuardRunner(), request.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
