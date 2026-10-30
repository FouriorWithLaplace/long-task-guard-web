import { connection } from "next/server";
import { getGuardManager } from "@/server/guard-service";
import { createGuardEventStream } from "@/server/guard-events";

export async function GET(request: Request) {
  await connection();
  const stream = createGuardEventStream(getGuardManager(), request.signal);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
