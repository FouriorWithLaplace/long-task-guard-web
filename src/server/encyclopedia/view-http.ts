import fs from "node:fs";
import { paths } from "./config.ts";
import { PageViews } from "./page-views.ts";
import type { EntrySummary } from "../../types/encyclopedia.ts";

export const pageViews = new PageViews(paths);
const headers = { "Cache-Control": "no-store" };
function selectedView(url: URL) {
  const params = url.searchParams;
  const view = params.get("view") || "home";
  const home = pageViews.home();
  const common = { activeCount: home.activeCount };
  if (view === "home") return { ...common, home };
  if (view === "category") return { ...common, entries: pageViews.entries(
    params.get("category") || "", (params.get("q") || "").slice(0, 200), Number(params.get("page") || 1), params.get("status") || "all", false, params.get("sort") || "default",
  ) };
  if (view === "running") return { ...common, ...pageViews.tasks(
    params.get("history") === "true", Number(params.get("page") || 1), false, params.get("category") || "all", params.get("sort") || "default",
  ) };
  if (view === "entry") {
    const id = Number(params.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("词条 ID 不合法。");
    const entry = pageViews.entry(id) as (EntrySummary & { viewRevision?: string }) | null;
    return { ...common, detailRevision: entry?.viewRevision || "deleted" };
  }
  throw new Error("未知的页面类型。");
}

// Every connection observes only its own visible page. Keepalive never reads SQLite.
export function viewEvents(request: Request) {
  const url = new URL(request.url);
  let watcher: fs.FSWatcher | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let abort = function nothing() {};
  function cleanup() {
    if (closed) return;
    closed = true;
    watcher?.close();
    clearInterval(heartbeat);
    clearTimeout(pending);
    request.signal.removeEventListener("abort", abort);
  }
  // Validate before starting a stream, so missing views produce an ordinary HTTP error.
  selectedView(url);
  const stream = new ReadableStream({
    start(controller) {
      let previous = "";
      let revision = "";
      function enqueue(text: string) {
        if (closed) return;
        if ((controller.desiredSize ?? 1) <= 0) { cleanup(); controller.close(); return; }
        controller.enqueue(new TextEncoder().encode(text));
      }
      function send() {
        pending = undefined;
        if (closed) return;
        try {
          const currentRevision = pageViews.manifest().revision;
          if (currentRevision === revision) return;
          const body = JSON.stringify(selectedView(url));
          revision = currentRevision;
          if (body === previous) return;
          previous = body;
          enqueue("event: view\ndata: " + body + "\n\n");
        } catch { enqueue("event: retry\ndata: {}\n\n"); }
      }
      abort = function abortStream() { cleanup(); try { controller.close(); } catch { /* Already closed. */ } };
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) { abort(); return; }
      watcher = fs.watch(pageViews.directory, function changed(event, filename) {
        if ((!filename || String(filename) === "manifest.json") && !pending) pending = setTimeout(send, 100);
      });
      watcher.on("error", function failed(error) { cleanup(); controller.error(error); });
      // Also check the small files on heartbeat in case a filesystem event was lost.
      heartbeat = setInterval(function keepalive() { send(); enqueue(": keepalive\n\n"); }, 15000);
      send();
    },
    cancel: cleanup,
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" } });
}

export function viewRequest(request: Request, segments: string[]): Response | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  let result: unknown;
  if (segments[0] === "events" && segments.length === 1) return viewEvents(request);
  if (segments[0] === "categories" && segments.length === 1) result = pageViews.home();
  else if (segments[0] === "categories" && segments.length === 2) result = pageViews.entries(
    segments[1], (url.searchParams.get("q") || "").slice(0, 200), Number(url.searchParams.get("page") || 1),
    url.searchParams.get("status") || "all", url.searchParams.get("selection") === "all",
    url.searchParams.get("sort") || "default",
  );
  else if (segments[0] === "tasks" && segments.length === 1) result = pageViews.tasks(
    url.searchParams.get("history") === "true",
    Number(url.searchParams.get("page") || 1),
    url.searchParams.get("selection") === "all",
    url.searchParams.get("category") || "all",
    url.searchParams.get("sort") || "default",
  );
  else return null;
  return Response.json(result, { headers });
}
