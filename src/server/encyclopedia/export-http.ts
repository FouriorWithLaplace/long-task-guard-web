import fs from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createCompletedArchive } from "./export-archive.ts";
import type { ExportArchive } from "./export-archive.ts";
import type { EncyclopediaPaths } from "./config.ts";
import type { TaskFilterState } from "../../types/encyclopedia.ts";

type Download = {
  archive: ExportArchive;
  timer: ReturnType<typeof setTimeout>;
  jobId?: string;
  streams: number;
  expired: boolean;
};
type ExportJob =
  | { status: "preparing" }
  | {
      status: "ready";
      url: string;
      filename: string;
      count: number;
      originalsIncluded: boolean;
      expiresAt: number;
    }
  | { status: "failed"; error: string };
const shared = globalThis as typeof globalThis & {
  encyclopediaExports?: {
    preparing: boolean;
    downloads: Map<string, Download>;
    jobs?: Map<string, ExportJob>;
  };
};
const state = shared.encyclopediaExports ??= {
  preparing: false,
  downloads: new Map(),
  jobs: new Map(),
};
const jobs = state.jobs ??= new Map<string, ExportJob>();
const headers = { "Cache-Control": "no-store" };
const lifetime = 10 * 60 * 1000;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cleanup(archive: ExportArchive) {
  void archive.cleanup().catch(function failed(error) {
    console.error("导出临时文件清理失败", error);
  });
}

function expireDownload(token: string) {
  const download = state.downloads.get(token);
  if (!download) return;
  state.downloads.delete(token);
  clearTimeout(download.timer);
  if (download.jobId) jobs.delete(download.jobId);
  download.expired = true;
  // 链接到期不打断正在传输的文件；最后一个流关闭后再清理。
  if (download.streams === 0) cleanup(download.archive);
}

function startExportJob(
  config: EncyclopediaPaths,
  readStates: () => Map<number, TaskFilterState>,
) {
  const jobId = randomUUID();
  jobs.set(jobId, { status: "preparing" });
  state.preparing = true;
  // 任务在后台服务中继续运行，不能绑定到很快结束的 HTTP 请求信号。
  const jobSignal = new AbortController().signal;
  void createCompletedArchive(config, readStates, jobSignal, { includeOriginals: false })
    .then(function ready(archive) {
      const token = randomUUID();
      const timer = setTimeout(function expire() {
        expireDownload(token);
      }, lifetime);
      timer.unref();
      state.downloads.set(token, { archive, timer, jobId, streams: 0, expired: false });
      jobs.set(jobId, {
        status: "ready",
        url: "/api/encyclopedia/export/" + token,
        filename: archive.filename,
        count: archive.count,
        originalsIncluded: archive.originalsIncluded,
        expiresAt: Date.now() + lifetime,
      });
    })
    .catch(function failed(error) {
      jobs.set(jobId, { status: "failed", error: errorText(error) });
      const timer = setTimeout(function expire() { jobs.delete(jobId); }, lifetime);
      timer.unref();
    })
    .finally(function done() { state.preparing = false; });
  return Response.json(
    { jobUrl: "/api/encyclopedia/export/status/" + jobId },
    { status: 202, headers },
  );
}

export async function exportRequest(
  request: Request,
  segments: string[],
  config: EncyclopediaPaths,
  readStates: () => Map<number, TaskFilterState>,
) {
  if (request.method === "POST" && segments.length === 1) {
    const mode = new URL(request.url).searchParams.get("mode") || "display";
    if (mode !== "display")
      return Response.json({ error: "当前仅支持导出数据库和图片，不包含原始资料。" }, { status: 400, headers });
    if (state.preparing || state.downloads.size >= 2)
      return Response.json({ error: "已有导出正在准备或等待下载，请稍后重试。" }, { status: 409, headers });
    return startExportJob(config, readStates);
  }
  if (request.method === "GET" && segments.length === 3 && segments[1] === "status") {
    const job = jobs.get(segments[2]);
    if (!job)
      return Response.json({ error: "导出任务不存在或已过期。" }, { status: 404, headers });
    return Response.json(job, { headers });
  }
  if (request.method === "DELETE" && segments.length === 2) {
    expireDownload(segments[1]);
    return new Response(null, { status: 204, headers });
  }
  if (request.method === "GET" && segments.length === 2) {
    const download = state.downloads.get(segments[1]);
    if (!download) return Response.json({ error: "下载已过期，请重新导出。" }, { status: 404, headers });
    const size = fs.statSync(download.archive.file).size;
    download.streams += 1;
    const stream = fs.createReadStream(download.archive.file);
    function abort() { stream.destroy(new Error("下载已取消。")); }
    request.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", function closed() {
      request.signal.removeEventListener("abort", abort);
      download.streams -= 1;
      if (download.expired && download.streams === 0) cleanup(download.archive);
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
