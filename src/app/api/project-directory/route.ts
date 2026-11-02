import { checkGuardOrigin, guardErrorResponse, guardResponseHeaders } from "@/server/guard-http";
import { pickProjectDirectory } from "@/server/project-picker";

export async function POST(request: Request) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const projectPath = await pickProjectDirectory();
    return Response.json({ projectPath, cancelled: projectPath === null }, { headers: guardResponseHeaders });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
