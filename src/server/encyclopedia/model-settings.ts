import { encyclopediaDefaultModel } from "../../types/model.ts";
import type { ModelCatalog, ModelSelection } from "../../types/model.ts";

// 入队只校验参数形状。模型是否可用由实际执行时的连接确认。
export function queuedTaskModel(input: { model?: unknown; reasoning?: unknown }, existing?: ModelSelection | null): ModelSelection {
  for (const value of [input.model, input.reasoning]) {
    if (value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 200))
      throw new Error("模型和推理强度必须是 1 至 200 字符的非空字符串。");
  }
  const model = (input.model as string | undefined) || existing?.model || encyclopediaDefaultModel.model;
  const changedModel = !!input.model && input.model !== existing?.model;
  const reasoning = (input.reasoning as string | undefined) ||
    (!changedModel && existing?.reasoning) || encyclopediaDefaultModel.reasoning;
  return { model, reasoning };
}

// 显式设置优先，其次保留任务设置；新任务使用工作台默认值。
export function resolveTaskModel(
  catalog: ModelCatalog,
  input: { model?: unknown; reasoning?: unknown },
  existing?: ModelSelection | null,
): ModelSelection {
  for (const value of [input.model, input.reasoning]) {
    if (value !== undefined && typeof value !== "string") {
      throw new Error("模型和推理强度必须是字符串。");
    }
  }
  const model = input.model || existing?.model || encyclopediaDefaultModel.model;
  const changedModel = !!input.model && input.model !== existing?.model;
  const reasoning = input.reasoning ||
    (!changedModel && existing?.reasoning) || encyclopediaDefaultModel.reasoning;
  const selected = catalog.models.find(function match(option) {
    return option.id === model;
  });
  if (!selected) throw new Error("模型不可用，请更新模型目录并选择可用模型：" + model);
  const supported = selected.reasoningEfforts.some(function allowed(effort) {
    return effort.value === reasoning;
  });
  if (!supported) throw new Error("推理强度不受当前模型支持：" + reasoning);
  return { model: selected.id, reasoning: reasoning as string };
}
