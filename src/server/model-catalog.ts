import fs from "node:fs";
import { readFile, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import readline from "node:readline";
import type { ModelCatalog, ModelOption, ReasoningOption } from "@/types/model";

interface RpcMessage {
  id?: number;
  result?: {
    data?: unknown;
    nextCursor?: string | null;
  };
  error?: {
    message?: string;
  };
}

let pendingRefresh: Promise<ModelCatalog> | null = null;

function getCachePath(): string {
  let directory = process.env.LONG_TASK_GUARD_DATA_DIR;

  if (!directory) {
    const localData = process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share");
    directory = path.join(localData, "LongTaskGuardWeb");
  }

  return path.join(directory, "model-catalog.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function findCodexExecutable(): string {
  const configuredPath = process.env.LONG_TASK_GUARD_CODEX_PATH;

  if (configuredPath) {
    if (!path.isAbsolute(configuredPath) || !isExistingFile(configuredPath)) {
      throw new Error("LONG_TASK_GUARD_CODEX_PATH 必须指向存在的 Codex 可执行文件。");
    }

    return configuredPath;
  }

  let executableName = "codex";

  if (process.platform === "win32") {
    executableName = "codex.exe";
  }

  const searchDirectories = (process.env.PATH || "").split(path.delimiter);

  for (const directory of searchDirectories) {
    if (directory.trim() === "") {
      continue;
    }

    const candidate = path.join(directory.replace(/^"|"$/g, ""), executableName);

    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  if (process.platform === "win32") {
    const extensionsDirectory = path.join(os.homedir(), ".vscode", "extensions");

    if (fs.existsSync(extensionsDirectory)) {
      const directories = fs.readdirSync(extensionsDirectory);

      function newestFirst(left: string, right: string) {
        return right.localeCompare(left, undefined, { numeric: true });
      }

      directories.sort(newestFirst);

      for (const directory of directories) {
        if (!directory.startsWith("openai.chatgpt-")) {
          continue;
        }

        const candidate = path.join(extensionsDirectory, directory, "bin", "windows-x86_64", "codex.exe");

        if (isExistingFile(candidate)) {
          return candidate;
        }
      }
    }
  }

  throw new Error("找不到本机 Codex CLI，请检查安装或设置 LONG_TASK_GUARD_CODEX_PATH。");
}

function parseModels(value: unknown): ModelOption[] {
  if (!Array.isArray(value)) {
    throw new Error("Codex 返回的模型目录格式不正确。");
  }

  const models: ModelOption[] = [];

  for (const entry of value) {
    if (!isObject(entry) || typeof entry.model !== "string" || entry.model === "") {
      throw new Error("Codex 返回的模型缺少标识。");
    }

    if (entry.hidden === true) {
      continue;
    }

    if (!Array.isArray(entry.supportedReasoningEfforts)) {
      throw new Error("Codex 返回的模型缺少推理强度信息。");
    }

    const efforts: ReasoningOption[] = [];

    for (const effort of entry.supportedReasoningEfforts) {
      if (!isObject(effort) || typeof effort.reasoningEffort !== "string") {
        throw new Error("Codex 返回的推理强度格式不正确。");
      }

      let description = "";

      if (typeof effort.description === "string") {
        description = effort.description;
      }

      efforts.push({ value: effort.reasoningEffort, description: description });
    }

    if (efforts.length === 0) {
      throw new Error("Codex 返回了没有可选推理强度的模型。");
    }

    let defaultEffort = efforts[0].value;

    for (const effort of efforts) {
      if (effort.value === entry.defaultReasoningEffort) {
        defaultEffort = effort.value;
        break;
      }
    }

    let name = entry.model;
    let description = "";

    if (typeof entry.displayName === "string" && entry.displayName !== "") {
      name = entry.displayName;
    }

    if (typeof entry.description === "string") {
      description = entry.description;
    }

    models.push({
      id: entry.model,
      name: name,
      description: description,
      reasoningEfforts: efforts,
      defaultReasoningEffort: defaultEffort,
      isDefault: entry.isDefault === true,
    });
  }

  return models;
}

// 只有 refreshModelCatalog 会调用这里。读取缓存不会寻找或启动 Codex。
function queryCodexModels(): Promise<ModelOption[]> {
  const executable = findCodexExecutable();

  return new Promise(function runQuery(resolve, reject) {
    const child = spawn(executable, ["--no-daemon", "app-server", "--listen", "stdio://"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readline.createInterface({ input: child.stdout });
    const models: ModelOption[] = [];
    const modelIds = new Set<string>();
    const cursors = new Set<string>();
    let finished = false;
    let requestId = 1;
    let receivedBytes = 0;

    function finish(error: Error | null) {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      lines.close();
      child.stdin.end();
      child.kill();

      if (error) {
        reject(error);
      } else {
        resolve(models);
      }
    }

    function handleTimeout() {
      finish(new Error("查询 Codex 模型目录超时，请稍后重试。"));
    }

    const timeout = setTimeout(handleTimeout, 20000);

    function send(message: object) {
      if (!finished) {
        child.stdin.write(JSON.stringify(message) + "\n");
      }
    }

    function requestModels(cursor: string | null) {
      requestId++;
      send({ id: requestId, method: "model/list", params: { includeHidden: false, limit: 100, cursor: cursor } });
    }

    function handleLine(line: string) {
      if (finished) {
        return;
      }

      let message: RpcMessage;

      try {
        const parsed = JSON.parse(line);

        if (!isObject(parsed)) {
          throw new Error("Invalid RPC message");
        }

        message = parsed;
      } catch {
        finish(new Error("Codex 返回了无法解析的协议数据。"));
        return;
      }

      if (message.id !== requestId) {
        return;
      }

      if (message.error) {
        finish(new Error(message.error.message || "Codex 模型目录查询失败。"));
        return;
      }

      if (requestId === 1) {
        send({ method: "initialized" });
        requestModels(null);
        return;
      }

      try {
        const page = parseModels(message.result?.data);

        for (const model of page) {
          if (!modelIds.has(model.id)) {
            modelIds.add(model.id);
            models.push(model);
          }
        }

        const cursor = message.result?.nextCursor;

        if (cursor) {
          if (cursors.has(cursor) || cursors.size >= 100) {
            throw new Error("Codex 模型目录分页异常。");
          }

          cursors.add(cursor);
          requestModels(cursor);
          return;
        }

        if (models.length === 0) {
          throw new Error("Codex 没有返回可选模型，已保留原缓存。");
        }

        finish(null);
      } catch (error) {
        let failure = new Error("无法处理 Codex 模型目录。");

        if (error instanceof Error) {
          failure = error;
        }

        finish(failure);
      }
    }

    lines.on("line", handleLine);
    child.stdout.on("data", function limitOutput(chunk: Buffer) {
      receivedBytes += chunk.length;

      if (receivedBytes > 4 * 1024 * 1024) {
        finish(new Error("Codex 模型目录响应过大。"));
      }
    });
    child.stderr.resume();
    child.on("error", function handleStartError() {
      finish(new Error("无法启动 Codex CLI，请检查本机安装。"));
    });
    child.stdin.on("error", function handleInputError() {
      finish(new Error("与 Codex 的通信已中断。"));
    });
    child.on("close", function handleExit() {
      if (!finished) {
        finish(new Error("Codex 在返回模型目录前退出。"));
      }
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "long_task_guard", version: "0.1.0" },
        capabilities: { experimentalApi: false },
      },
    });
  });
}

export async function readCachedModelCatalog(): Promise<ModelCatalog> {
  let source: string;

  try {
    source = await readFile(getCachePath(), "utf8");
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") {
      return { version: 1, updatedAt: null, models: [] };
    }

    throw new Error("无法读取本机模型缓存，请检查数据目录权限。");
  }

  try {
    const catalog = JSON.parse(source);

    if (!isObject(catalog) || catalog.version !== 1 || !Array.isArray(catalog.models) ||
        typeof catalog.updatedAt !== "string" || !Number.isFinite(Date.parse(catalog.updatedAt)) || catalog.models.length === 0) {
      throw new Error("Invalid cache");
    }

    for (const model of catalog.models) {
      if (!isObject(model) || typeof model.id !== "string" || model.id === "" ||
          typeof model.name !== "string" || typeof model.description !== "string" ||
          typeof model.isDefault !== "boolean" || typeof model.defaultReasoningEffort !== "string" ||
          !Array.isArray(model.reasoningEfforts) || model.reasoningEfforts.length === 0) {
        throw new Error("Invalid cached model");
      }

      let hasDefault = false;

      for (const effort of model.reasoningEfforts) {
        if (!isObject(effort) || typeof effort.value !== "string" || effort.value === "" || typeof effort.description !== "string") {
          throw new Error("Invalid cached reasoning effort");
        }

        if (effort.value === model.defaultReasoningEffort) {
          hasDefault = true;
        }
      }

      if (!hasDefault) {
        throw new Error("Invalid cached default reasoning effort");
      }
    }

    return catalog as unknown as ModelCatalog;
  } catch {
    throw new Error("模型缓存格式不正确，请点击“更新模型”重新获取。");
  }
}

async function refreshAndSave(): Promise<ModelCatalog> {
  const models = await queryCodexModels();
  const catalog: ModelCatalog = { version: 1, updatedAt: new Date().toISOString(), models: models };
  const cachePath = getCachePath();
  const temporaryPath = cachePath + "." + randomUUID() + ".tmp";

  await mkdir(path.dirname(cachePath), { recursive: true });

  try {
    await writeFile(temporaryPath, JSON.stringify(catalog, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, cachePath);
  } finally {
    await unlink(temporaryPath).catch(function ignoreMissingTemporaryFile() {});
  }

  return catalog;
}

export async function refreshModelCatalog(): Promise<ModelCatalog> {
  if (pendingRefresh !== null) {
    return pendingRefresh;
  }

  pendingRefresh = refreshAndSave();

  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}
