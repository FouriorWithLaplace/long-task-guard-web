import type { GuardSettings } from "@/types/guard";

export const guardResponseHeaders = { "Cache-Control": "no-store" };

export function guardErrorResponse(error: unknown): Response {
  let message = "无法执行守护操作。";
  let status = 400;
  if (error instanceof Error) {
    message = error.message;
    if ("status" in error && typeof error.status === "number") status = error.status;
  }
  return Response.json({ error: message }, { status: status, headers: guardResponseHeaders });
}

export function checkGuardOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  // 本机脚本和 AI 客户端可以省略 Origin；浏览器请求仍校验同源。
  if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "请求来源不匹配。" }, { status: 403, headers: guardResponseHeaders });
  }
  return null;
}

export function readGuardObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求内容必须是 JSON 对象。");
  return value as Record<string, unknown>;
}

export function readGuardSettings(value: unknown): GuardSettings {
  const object = readGuardObject(value);
  const fields = ["sessionId", "model", "reasoning", "startMessage", "retryMessage", "completeMessage"] as const;
  const settings: GuardSettings = { sessionId: "", model: "", reasoning: "", startMessage: "", retryMessage: "", completeMessage: "" };
  for (const field of fields) {
    if (typeof object[field] !== "string") throw new Error("守护设置不完整：" + field);
    settings[field] = object[field];
  }
  return settings;
}
