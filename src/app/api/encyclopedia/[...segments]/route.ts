import { encyclopediaRequest } from "@/server/encyclopedia/http";

async function handle(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  return encyclopediaRequest(request, segments);
}
export { handle as GET, handle as POST, handle as DELETE };
