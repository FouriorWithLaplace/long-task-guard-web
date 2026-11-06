import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { encyclopediaRequest } from "../src/server/encyclopedia/http.ts";
import { getEncyclopediaService } from "../src/server/encyclopedia/service.ts";

const token = process.env.ENCYCLOPEDIA_BACKEND_TOKEN;
if (!token) throw new Error("Task service must be launched by scripts/serve.mjs");
const server = http.createServer(async function handle(incoming, outgoing) {
  if (incoming.headers["x-panel-token"] !== token) {
    outgoing.writeHead(403).end();
    return;
  }
  const controller = new AbortController();
  outgoing.once("close", function disconnected() { controller.abort(); });
  try {
    const url = String(incoming.headers["x-panel-url"] || "");
    const parsed = new URL(url);
    const prefix = "/api/encyclopedia/";
    if (!parsed.pathname.startsWith(prefix)) { outgoing.writeHead(404).end(); return; }
    const segments = parsed.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string" && !key.startsWith("x-panel-")) headers.set(key, value);
    }
    headers.set("host", parsed.host);
    const chunks = [];
    let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 1024 * 1024) { outgoing.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const method = incoming.method || "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
    const request = new Request(url, { method, headers, body, signal: controller.signal });
    const response = await encyclopediaRequest(request, segments);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
    else outgoing.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "后台请求失败，请查看终端日志。" }));
  }
});
const service = getEncyclopediaService();
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  service.terminals.dispose();
  service.manager.dispose();
  server.closeAllConnections();
  server.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("disconnect", shutdown);
server.listen(0, "127.0.0.1", function ready() {
  const address = server.address();
  process.send?.({ ready: true, endpoint: "http://127.0.0.1:" + address.port });
});
