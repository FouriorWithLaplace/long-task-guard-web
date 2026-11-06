import {
  checkGuardOrigin,
  guardErrorResponse,
  guardResponseHeaders,
} from "../guard-http.ts";
import { terminalRequest } from "../guard-terminal-http.ts";
import { readCachedModelCatalog } from "../model-catalog.ts";
import {
  readCategoryFieldMarkdown,
  readDetail,
} from "./database.ts";
import { paths } from "./config.ts";
import { getEncyclopediaService } from "./service.ts";
import { assertCurrentTaskProtocol, batchOperate, orderBatchIds, parseBatch, parseBatchIds } from "./batch.ts";
import { exportRequest } from "./export-http.ts";
import {readEntryImage} from "./media.ts";
import { viewRequest } from "./view-http.ts";
import { displayTask } from "./task-summary.ts";
import { readAllFieldMarkdown } from "./field-export.ts";
import { resolveTaskModel } from "./model-settings.ts";

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
    const view = viewRequest(request, segments);
    if (view) return view;
    if (request.method === "GET" && segments.length === 1 && segments[0] === "fields") {
      return new Response(readAllFieldMarkdown(paths), {
        headers: {
          ...guardResponseHeaders,
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="encyclopedia-all-fields.md"',
        },
      });
    }
    const service = getEncyclopediaService();
    const manager = service.manager;
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
      if (
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
      } else if (segments[0] === "entries" && segments.length === 2) {
        const id = entityId(segments[1]);
        const history = manager.history(id);
        result = {
          entry: readDetail(paths, id),
          task: manager.get(id),
          history,
        };
      } else return Response.json({ error: "接口不存在。" }, { status: 404 });
      return Response.json(result, { headers: guardResponseHeaders });
    }
    if (request.method === "POST" && segments[0] === "batch" && segments[1] === "order" && segments.length === 2) {
      const raw = await request.text();
      if (raw.length > 1000000) throw new Error("请求过大。");
      const body = JSON.parse(raw);
      const ids = parseBatchIds(body?.ids, 50000);
      return Response.json({ ids: orderBatchIds(manager, ids) }, { headers: guardResponseHeaders });
    }
    if (
      request.method === "POST" &&
      segments[0] === "batch" &&
      segments.length === 1
    ) {
      const raw = await request.text();
      if (raw.length > 10000) throw new Error("请求过大。");
      const body = JSON.parse(raw);
      const batch = parseBatch(body);
      let catalogPromise: ReturnType<typeof readCachedModelCatalog> | undefined;
      const results = await batchOperate(
        manager,
        batch.action,
        batch.ids,
        async function modelFor(task) {
          catalogPromise ??= readCachedModelCatalog();
          const catalog = await catalogPromise;
          return resolveTaskModel(catalog, body, task);
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
      if (body.action === "stop") {
        await manager.stop(id);
        const task = manager.store.getSummary(id);
        return Response.json(
          { task: task ? displayTask(task) : null },
          { headers: guardResponseHeaders },
        );
      }
      if (body.action !== "continue" && body.action !== "restart" && body.action !== "configure") throw new Error("不支持的操作。");
      assertCurrentTaskProtocol(manager);
      const existing = manager.get(id);
      const catalog = await readCachedModelCatalog();
      const settings = resolveTaskModel(catalog, body, existing);
      if (body.action === "configure") {
        if (typeof manager.configure !== "function") throw new Error("请重启后台服务以使用模型切换功能。");
        manager.configure(id, settings.model, settings.reasoning);
      } else manager.start(id, settings.model, settings.reasoning, body.action);
      return Response.json(
        { task: displayTask(manager.store.getSummary(id)!) },
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
