import { discoverSessions } from "@/server/session-scanner";
import { connection } from "next/server";

export async function GET() {
  // 每次收到请求后再读取本机数据库，避免构建时预生成会话列表。
  await connection();

  try {
    const sessions = discoverSessions();

    return Response.json(
      { sessions: sessions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    let message = "读取会话失败";

    if (error instanceof Error) {
      message = error.message;
    }

    return Response.json(
      { sessions: [], error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
