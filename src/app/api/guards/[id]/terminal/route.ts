import { connection } from "next/server";
import { getGuardManager } from "@/server/guard-service";
import { GuardTerminalService } from "@/server/guard-terminal-service";
import { terminalRequest } from "@/server/guard-terminal-http";

const terminalGlobal = globalThis as typeof globalThis & { longTaskGuardTerminals?: GuardTerminalService };
type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, context: Context) {
  await connection();
  const manager = getGuardManager();
  if (!terminalGlobal.longTaskGuardTerminals) terminalGlobal.longTaskGuardTerminals = new GuardTerminalService(manager);
  const { id } = await context.params;
  return terminalRequest(request, id, terminalGlobal.longTaskGuardTerminals);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
