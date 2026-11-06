import { encyclopediaGateway } from "@/server/encyclopedia/gateway";

async function handle(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  return encyclopediaGateway(request, segments);
}
export { handle as GET, handle as POST, handle as DELETE };
