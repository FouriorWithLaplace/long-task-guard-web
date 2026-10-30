"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import type { ModelCatalog, ModelOption } from "@/types/model";

interface ModelSelection {
  model: string;
  reasoning: string;
}

interface ModelSelectorProps extends ModelSelection {
  onChange: (model: string, reasoning: string) => void;
  locked?: boolean;
  restorePreference?: boolean;
}

const preferenceKey = "long-task-guard.model-selection";

function readSelection(): ModelSelection {
  try {
    const source = localStorage.getItem(preferenceKey);

    if (source !== null) {
      const saved = JSON.parse(source);

      if (typeof saved.model === "string" && typeof saved.reasoning === "string") {
        return saved;
      }
    }
  } catch {
    // 浏览器禁用存储或记录损坏时，仍然可以选择模型。
  }

  return { model: "", reasoning: "" };
}

function saveSelection(model: string, reasoning: string) {
  try {
    const selection = { model: model, reasoning: reasoning };
    localStorage.setItem(preferenceKey, JSON.stringify(selection));
  } catch {
    // 浏览器存储不可用不影响服务器上的模型目录缓存。
  }
}

function chooseSelection(models: ModelOption[], preferred: ModelSelection): ModelSelection {
  if (models.length === 0) {
    return { model: "", reasoning: "" };
  }

  let selected = models[0];

  for (const model of models) {
    if (model.isDefault) {
      selected = model;
      break;
    }
  }

  for (const model of models) {
    if (model.id === preferred.model) {
      selected = model;
      break;
    }
  }

  let reasoning = selected.defaultReasoningEffort;

  for (const effort of selected.reasoningEfforts) {
    if (effort.value === preferred.reasoning) {
      reasoning = effort.value;
      break;
    }
  }

  return { model: selected.id, reasoning: reasoning };
}

async function readResponse(response: Response): Promise<ModelCatalog> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "读取模型目录失败");
  }

  return data;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "读取模型目录失败，请重试。";
}

export default function ModelSelector({ model, reasoning, onChange, locked = false, restorePreference = true }: ModelSelectorProps) {
  const [catalog, setCatalog] = useState<ModelCatalog>({ version: 1, updatedAt: null, models: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // 页面打开只读缓存；即使没有缓存，也不会自动调用 Codex。
  useEffect(function loadCacheOnMount() {
    const controller = new AbortController();

    async function loadCache() {
      try {
        const response = await fetch("/api/models", { cache: "no-store", signal: controller.signal });
        const cached = await readResponse(response);

        if (controller.signal.aborted) {
          return;
        }

        setCatalog(cached);
        if (restorePreference) {
          const selection = chooseSelection(cached.models, readSelection());
          onChange(selection.model, selection.reasoning);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(errorMessage(failure));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCache();

    return function cancelLoading() {
      controller.abort();
    };
  }, [onChange, restorePreference]);

  async function handleRefresh() {
    if (loading || refreshing || locked) {
      return;
    }

    setRefreshing(true);
    setError("");

    try {
      // 只有这里发送 POST，请求服务器启动 Codex 查询目录。
      const response = await fetch("/api/models", { method: "POST", cache: "no-store" });
      const updated = await readResponse(response);
      const preferred = { model: model, reasoning: reasoning };
      const selection = chooseSelection(updated.models, preferred);

      setCatalog(updated);
      onChange(selection.model, selection.reasoning);
      saveSelection(selection.model, selection.reasoning);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setRefreshing(false);
    }
  }

  function handleModelChange(event: ChangeEvent<HTMLSelectElement>) {
    const preferred = { model: event.target.value, reasoning: reasoning };
    const selection = chooseSelection(catalog.models, preferred);
    onChange(selection.model, selection.reasoning);
    saveSelection(selection.model, selection.reasoning);
  }

  function handleReasoningChange(event: ChangeEvent<HTMLSelectElement>) {
    const newReasoning = event.target.value;
    onChange(model, newReasoning);
    saveSelection(model, newReasoning);
  }

  let selectedModel: ModelOption | undefined;

  for (const option of catalog.models) {
    if (option.id === model) {
      selectedModel = option;
      break;
    }
  }

  let status = "暂无模型缓存，请点击“更新模型”获取。";

  if (loading) {
    status = "正在读取本地模型缓存…";
  } else if (refreshing) {
    status = "正在查询本地 Codex，已有缓存会保留到更新成功。";
  } else if (catalog.updatedAt !== null) {
    const updatedAt = new Date(catalog.updatedAt).toLocaleString();
    status = "使用本地缓存 · 上次更新：" + updatedAt;
  }

  const disabled = locked || loading || refreshing || catalog.models.length === 0;
  const fieldClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:opacity-60";

  return (
    <div>
      <div className="grid min-w-0 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <label htmlFor="model" className="mb-2 block text-sm font-medium text-slate-700">模型</label>
          <select id="model" value={model} onChange={handleModelChange} disabled={disabled} className={fieldClass} title={selectedModel?.description}>
            {catalog.models.length === 0 && <option value="">暂无模型缓存</option>}
            {catalog.models.map(function renderModel(option) {
              return <option key={option.id} value={option.id}>{option.name}</option>;
            })}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="reasoning" className="mb-2 block text-sm font-medium text-slate-700">推理强度</label>
          <select id="reasoning" value={reasoning} onChange={handleReasoningChange} disabled={disabled} className={fieldClass}>
            {!selectedModel && <option value="">暂无推理强度</option>}
            {selectedModel?.reasoningEfforts.map(function renderEffort(effort) {
              return <option key={effort.value} value={effort.value} title={effort.description}>{effort.value}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={handleRefresh} disabled={locked || loading || refreshing} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
          {refreshing ? "正在更新…" : "更新模型"}
        </button>
      </div>
      <p role="status" className="mt-2 text-xs leading-5 text-slate-500">{status}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">仅点击更新时查询 Codex；缓存长期保存，不会自动更新。</p>
      {error !== "" && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
