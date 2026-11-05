import fs from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createCompletedArchive } from "./export-archive.ts";
import type { ExportArchive } from "./export-archive.ts";
import type { EncyclopediaPaths } from "./config.ts";
import type { TaskFilterState } from "../../types/encyclopedia.ts";

type Download = { archive: ExportArchive; timer: ReturnType<typeof setTimeout> };
const shared = globalThis as typeof globalThis & {
  encyclopediaExports?: { preparing: boolean; downloads: Map<string, Download> };
};
const state = shared.encyclopediaExports ??= { preparing: false, downloads: new Map() };
const headers = { "Cache-Control": "no-store" };

function cleanup(archive: ExportArchive) {
  void archive.cleanup().catch(function failed(error) { console.error("导出临时文件清理失败", error); });
}

export async function exportRequest(
  request: Request,
  segments: string[],
  config: EncyclopediaPaths,
  readStates: () => Map<number, TaskFilterState>,
) {
  if (request.method === "POST" && segments.length === 1) {
    if (state.preparing || state.downloads.size >= 2)
      return Response.json({ error: "已有导出正在准备或等待下载，请稍后重试。" }, { status: 409, headers });
    state.preparing = true;
    try {
      const archive = await createCompletedArchive(config, readStates, request.signal);
      if (request.signal.aborted) {
        await archive.cleanup();
        request.signal.throwIfAborted();
      }
      const token = randomUUID();
      const timer = setTimeout(function expire() {
        state.downloads.delete(token);
        cleanup(archive);
      }, 10 * 60 * 1000);
      timer.unref();
      state.downloads.set(token, { archive, timer });
      return Response.json({ url: "/api/encyclopedia/export/" + token, filename: archive.filename, count: archive.count }, { headers });
    } finally {
      state.preparing = false;
    }
  }
  if (request.method === "GET" && segments.length === 2) {
    const download = state.downloads.get(segments[1]);
    if (!download) return Response.json({ error: "下载已过期或已使用，请重新导出。" }, { status: 404, headers });
    const size = fs.statSync(download.archive.file).size;
    state.downloads.delete(segments[1]);
    clearTimeout(download.timer);
    const stream = fs.createReadStream(download.archive.file);
    function abort() { stream.destroy(new Error("下载已取消。")); }
    request.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", function closed() {
      request.signal.removeEventListener("abort", abort);
      cleanup(download.archive);
    });
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    if (request.signal.aborted) abort();
    return new Response(body, { headers: {
      ...headers,
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="' + download.archive.filename + '"',
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
    } });
  }
  return Response.json({ error: "不支持的导出操作。" }, { status: 405, headers });
}
