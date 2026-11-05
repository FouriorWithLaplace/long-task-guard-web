import {
  checkGuardOrigin,
  guardErrorResponse,
  guardResponseHeaders,
} from "../guard-http";
import { terminalRequest } from "../guard-terminal-http";
import { readCachedModelCatalog } from "../model-catalog";
import {
  readCategories,
  readCategoryFieldMarkdown,
  readDetail,
  readEntries,
} from "./database.ts";
import { paths } from "./config.ts";
import { getEncyclopediaService } from "./service.ts";
import type { EntryTask, TaskFilterState } from "../../types/encyclopedia.ts";
import { fieldProgress } from "../../types/encyclopedia.ts";
import { assertCurrentTaskProtocol, batchOperate, parseBatch } from "./batch.ts";
import { exportRequest } from "./export-http.ts";
import {readEntryImage} from "./media.ts";

function summary(task: EntryTask) {
  const results: EntryTask["results"] = {};
  for (const [key, result] of Object.entries(task.results)) {
    results[key] = {
      ...result,
      evidence: [],
      candidates: [],
      reason: "",
      nextCondition: "",
    };
  }
  return { ...task, results };
}

function entityId(value: string | undefined) {
  if (
    !value ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new Error("词条 ID 不合法。");
  return Number(value);
}
export async function encyclopediaRequest(
  request: Request,
  segments: string[],
) {
  const rejected = checkGuardOrigin(request);
  if (rejected) return rejected;
  try {
    const service = getEncyclopediaService();
    const manager = service.manager;
    const url = new URL(request.url);
    if (segments[0] === "export")
      return await exportRequest(request, segments, paths, function readStates() {
        return manager.store.phases();
      });
    if (
      segments[0] === "entries" &&
      segments[2] === "terminal" &&
      segments.length === 3
    )
      return terminalRequest(
        request,
        String(entityId(segments[1])),
        service.terminals,
      );
    if (request.method === "GET") {
      if(segments[0]==="entries"&&segments[2]==="images"&&segments.length===4){
        const image=readEntryImage(paths,entityId(segments[1]),segments[3]);
        return new Response(new Uint8Array(image.bytes),{headers:{...guardResponseHeaders,"Content-Type":image.mime,"X-Content-Type-Options":"nosniff"}});
      }
      let result: unknown;
      if (segments[0] === "categories" && segments.length === 1)
        result = {
          categories: readCategories(paths),
          workspace: paths.workspace,
          database: paths.database,
          concurrency: manager.concurrency,
        };
      else if (
        segments[0] === "categories" &&
        segments.length === 3 &&
        segments[2] === "fields"
      ) {
        const markdown = readCategoryFieldMarkdown(paths, segments[1]);
        const filename = "encyclopedia-" + segments[1] + "-fields.md";
        return new Response(markdown, {
          headers: {
            ...guardResponseHeaders,
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition":
              "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" +
              encodeURIComponent(filename),
          },
        });
      } else if (segments[0] === "categories" && segments.length === 2) {
        const filterStates = new Map<number, TaskFilterState>(manager.store.phases());
        for (const [id, phase] of filterStates) {
          if (phase !== "blocked" && phase !== "error") continue;
          const task = manager.get(id);
          if (task) filterStates.set(id, { phase: task.phase, desired: task.desired });
        }
        const page = readEntries(
          paths,
          segments[1],
          (url.searchParams.get("q") || "").slice(0, 200),
          Number(url.searchParams.get("page") || 1),
          url.searchParams.get("status") || "all",
          filterStates,
          url.searchParams.get("selection") === "all",
        );
        result = {
          ...page,
          entries: page.entries.map(function entry(item) {
            const task = manager.get(item.id);
            const detail = readDetail(paths, item.id);
            const progress = fieldProgress(detail.fields, task);
            return { ...item, progress, task: task ? summary({ ...task, filled: progress.filled }) : null };
          }),
        };
      } else if (segments[0] === "entries" && segments.length === 2) {
        const id = entityId(segments[1]);
        const history = manager.history(id);
        result = {
          entry: readDetail(paths, id),
          task: manager.get(id),
          history,
        };
      } else if (segments[0] === "tasks" && segments.length === 1)
        result = {
          tasks: manager.list().map(summary),
          concurrency: manager.concurrency,
        };
      else if (segments[0] === "events" && segments.length === 1) {
        let unsubscribe = function nothing() {};
        let timer: ReturnType<typeof setInterval> | undefined;
        let closed = false;
        let abort = function nothing() {};
        function cleanup() {
          if (closed) return;
          closed = true;
          unsubscribe();
          clearInterval(timer);
          request.signal.removeEventListener("abort", abort);
        }
        const stream = new ReadableStream({
          start(controller) {
            function send() {
              if (closed) return;
              if ((controller.desiredSize ?? 1) <= 0) {
                cleanup();
                controller.close();
                return;
              }
              controller.enqueue(
                new TextEncoder().encode(
                  "event: tasks\ndata: " +
                    JSON.stringify({ tasks: manager.list().map(summary) }) +
                    "\n\n",
                ),
              );
            }
            abort = function abortStream() {
              cleanup();
              try {
                controller.close();
              } catch {
                /* 已关闭。 */
              }
            };
            request.signal.addEventListener("abort", abort, { once: true });
            if (request.signal.aborted) {
              abort();
              return;
            }
            unsubscribe = manager.subscribe(send);
            timer = setInterval(send, 15000);
            send();
          },
          cancel: cleanup,
        });
        return new Response(stream, {
          headers: {
            ...guardResponseHeaders,
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",
          },
        });
      } else return Response.json({ error: "接口不存在。" }, { status: 404 });
      return Response.json(result, { headers: guardResponseHeaders });
    }
    if (
      request.method === "POST" &&
      segments[0] === "batch" &&
      segments.length === 1
    ) {
      const raw = await request.text();
      if (raw.length > 10000) throw new Error("请求过大。");
      const batch = parseBatch(JSON.parse(raw));
      let catalogPromise: ReturnType<typeof readCachedModelCatalog> | undefined;
      const results = await batchOperate(
        manager,
        batch.action,
        batch.ids,
        async function modelFor(task) {
          catalogPromise ??= readCachedModelCatalog();
          const catalog = await catalogPromise;
          const model = task
            ? catalog.models.find(function match(item) {
                return item.id === task.model;
              })
            : catalog.models.find(function defaultModel(item) {
                return item.isDefault;
              }) || catalog.models[0];
          if (!model) throw new Error("请先在模型设置中更新可用模型。");
          const reasoning = task?.reasoning || model.defaultReasoningEffort;
          if (
            !model.reasoningEfforts.some(function allowed(item) {
              return item.value === reasoning;
            })
          )
            throw new Error("推理强度不受当前模型支持。");
          return { model: model.id, reasoning };
        },
      );
      return Response.json({ results }, { headers: guardResponseHeaders });
    }
    if (
      request.method === "POST" &&
      segments[0] === "entries" &&
      segments.length === 2
    ) {
      if (Number(request.headers.get("content-length") || 0) > 10000)
        throw new Error("请求过大。");
      const body = await request.json();
      const id = entityId(segments[1]);
      if (body.action === "stop")
        return Response.json(
          { task: await manager.stop(id) },
          { headers: guardResponseHeaders },
        );
      if (body.action !== "continue" && body.action !== "restart") throw new Error("不支持的操作。");
      assertCurrentTaskProtocol(manager);
      const existing = manager.get(id);
      const catalog = await readCachedModelCatalog();
      const selected =
        catalog.models.find(function match(model) {
          return model.id === (body.model || existing?.model);
        }) ||
        (!body.model && !existing?.model
          ? catalog.models.find(function fallback(model) {
              return model.isDefault;
            }) || catalog.models[0]
          : undefined);
      if (!selected) throw new Error("请先在模型设置中更新并选择可用模型。");
      const reasoning =
        body.reasoning ||
        existing?.reasoning ||
        selected.defaultReasoningEffort;
      if (
        !selected.reasoningEfforts.some(function allowed(effort) {
          return effort.value === reasoning;
        })
      )
        throw new Error("推理强度不受当前模型支持。");
      return Response.json(
        { task: manager.start(id, selected.id, reasoning, body.action) },
        { headers: guardResponseHeaders },
      );
    }
    return Response.json(
      { error: "接口不存在或方法不支持。" },
      { status: 404 },
    );
  } catch (error) {
    return guardErrorResponse(error);
  }
}
