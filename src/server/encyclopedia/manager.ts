import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { CodexConnection, CodexEvents } from "../codex-client.ts";
import type { TerminalTarget } from "../codex-terminal.ts";
import type { EntryTask, StartMode } from "../../types/encyclopedia.ts";
import { fieldProgress, taskProgress } from "../../types/encyclopedia.ts";
import { hash, object, readDetail, readSource } from "./database.ts";
import { panelDirectory } from "./config.ts";
import type { EncyclopediaPaths } from "./config.ts";
import { TaskStore } from "./store.ts";
import { EntryWriter } from "./writer.ts";
import { researchTools } from "./tools.ts";

type ConnectionFactory = (events: CodexEvents, temp: string) => CodexConnection;
interface Execution {
  entityId: number;
  generation: number;
  connection: CodexConnection;
  turnId: string | null;
  sending: boolean;
  ending: boolean;
  endingPromise?: Promise<void>;
  sessionRequest?: Promise<unknown>;
  turnRequest?: Promise<unknown>;
  finishedTurns: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
  lastChecked: number;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class EncyclopediaManager {
  readonly taskProtocol = 3;
  readonly store: TaskStore;
  private writer: EntryWriter;
  private config: EncyclopediaPaths;
  private createConnection: ConnectionFactory;
  private skill: string;
  private executions = new Map<number, Execution>();
  private cleanupConnections = new Set<CodexConnection>();
  private listeners = new Set<() => void>();
  private owner = randomUUID();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private leader = false;
  readonly concurrency = 2;

  constructor(
    config: EncyclopediaPaths,
    factory: ConnectionFactory,
    skill: string,
    heartbeat = true,
  ) {
    this.config = config;
    this.createConnection = factory;
    this.skill = skill;
    this.store = new TaskStore(config);
    this.writer = new EntryWriter(config, this.store);
    this.leader = this.store.claimService(this.owner);
    if (this.leader) this.recoverService();
    if (heartbeat) {
      this.heartbeat = setInterval(this.tick.bind(this), 5000);
      this.heartbeat.unref();
    }
  }
  private assertOwner() {
    if (this.disposed || !this.store.claimService(this.owner))
      throw new Error("另一个服务正在管理这些词条，请使用原服务页面。");
  }
  private recoverService() {
    this.store.migrateTasks();
    let reservedSlots = 0;
    for (const task of this.store.list()) {
      // 旧版本可能留下超过并发上限的重试项；恢复时最多保留两个名额。
      if (task.desired === "running" && task.slotHeld) {
        task.slotHeld = reservedSlots < this.concurrency;
        if (task.slotHeld) reservedSlots++;
      }
      if (task.sessionId) {
        task.cleanupSessions.push(task.sessionId);
        task.sessionId = null;
      }
      task.generation++;
      try {
        if (!task.skillHash) task.skillHash = this.saveSkill();
        const detail = readDetail(this.config, task.entityId);
        task.scope = detail.fields.filter(function writable(field) {
          return field.writable;
        }).map(function key(field) { return field.key; });
        task.filled = fieldProgress(detail.fields).filled;
        this.writer.recover(task);
        if (task.desired === "stopped" && task.phase !== "completed")
          this.completeIfReady(task);
      } catch (error) {
        if (task.desired === "running") this.retry(task, error, task.slotHeld);
        else {
          task.phase = "blocked";
          task.slotHeld = false;
          task.message = "恢复核对失败：" + errorText(error);
          this.save(task, "recovery_error");
        }
        continue;
      }
      if (task.desired === "running") {
        task.phase = task.slotHeld ? "retrying" : "queued";
        task.message = "服务已恢复，等待继续未处理字段或核对未确认提交。";
      } else if (
        ["starting", "running", "stopping", "retrying", "queued"].includes(
          task.phase,
        )
      )
        task.phase = "stopped";
      if (task.desired !== "running") task.slotHeld = false;
      this.store.save(task, "service_recovered");
    }
    queueMicrotask(this.pump.bind(this));
    void this.cleanupStoppedSessions();
  }
  private async cleanupStoppedSessions() {
    for (const task of this.store.list()) {
      if (this.disposed) return;
      if (task.desired === "stopped" && task.cleanupSessions.length)
        await this.cleanupDetached(task.entityId);
    }
  }
  tick() {
    if (this.disposed) return;
    const owner = this.store.claimService(this.owner);
    if (!owner) {
      for (const execution of this.executions.values()) {
        clearTimeout(execution.timer);
        execution.connection.close();
      }
      this.executions.clear();
      this.leader = false;
      return;
    }
    if (!this.leader) {
      this.leader = true;
      this.recoverService();
    }
    this.pump();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    const listeners = this.listeners;
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }
  private publish() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* 页面关闭不影响执行。 */
      }
    }
  }
  private save(task: EntryTask, event?: string) {
    this.store.save(task, event);
    this.publish();
  }
  get(id: number) {
    return this.store.get(id);
  }
  list() {
    return this.store.list();
  }
  history(id: number) {
    return this.store.history(id);
  }

  private saveSkill() {
    const skillHash = hash(this.skill);
    const rules = path.join(panelDirectory(this.config), "rules");
    fs.mkdirSync(rules, { recursive: true });
    const snapshot = path.join(rules, skillHash + ".md");
    if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot, this.skill, { flag: "wx" });
    return skillHash;
  }

  start(id: number, model: string, reasoning: string, mode: StartMode = "continue") {
    this.assertOwner();
    const detail = readDetail(this.config, id);
    if (detail.state === "excluded")
      throw new Error("被排除的词条仅供查看，不允许启动采集。");
    if (!detail.fields.length) throw new Error("词条没有可用字段字典。");
    let task = this.store.get(id);
    if (
      task?.desired === "running" ||
      task?.phase === "stopping" ||
      this.executions.has(id)
    )
      return task;
    if (task) {
      // 继续操作允许进入自动核对；重置任务前则必须确认旧提交，避免丢失归属。
      try {
        this.writer.recover(task);
      } catch (error) {
        if (mode === "restart") throw error;
      }
      if (task.unconfirmed && mode === "restart")
        throw new Error("存在待核对提交，请先继续当前任务完成核对，再重新处理全部字段。");
    }
    const reset = !task || mode === "restart";
    if (reset) {
      const previous = task;
      const cleanupSessions = [...(previous?.cleanupSessions || [])];
      if (previous?.sessionId) cleanupSessions.push(previous.sessionId);
      task = {
        entityId: id,
        name: detail.name,
        type: detail.type,
        phase: "queued",
        desired: "running",
        mode,
        processedFields: [],
        filled: fieldProgress(detail.fields).filled,
        slotHeld: false,
        queuedAt: new Date().toISOString(),
        runId: randomUUID(),
        generation: (previous?.generation || 0) + 1,
        attempt: 0,
        failures: 0,
        noProgress: 0,
        sessionId: null,
        cleanupSessions,
        cleanupError: previous?.cleanupError || "",
        model,
        reasoning,
        scope: detail.fields.filter(function writable(field) {
          return field.writable;
        }).map(function key(field) {
          return field.key;
        }),
        dictionaryHash: detail.dictionaryHash,
        skillHash: this.saveSkill(),
        results: previous?.results || {},
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nextRetryAt: null,
        message: mode === "restart" ? "已加入队列，重新处理全部字段；现有内容保留。" : "已加入采集队列。",
        unconfirmed: 0,
      };
    } else {
      task = task!;
      if (task.phase === "completed") return task;
      if (task.dictionaryHash !== detail.dictionaryHash)
        throw new Error("字段规则发生变化，请选择重新处理全部字段。");
      task.phase = "queued";
      task.desired = "running";
      task.model = model;
      task.reasoning = reasoning;
      task.failures = 0;
      task.noProgress = 0;
      task.nextRetryAt = null;
      task.generation++;
      task.slotHeld = false;
      task.queuedAt = new Date().toISOString();
      task.filled = fieldProgress(detail.fields).filled;
      task.message = "继续当前任务，只处理尚未检查的字段。";
    }
    this.save(task, mode === "restart" ? "all_fields_requested" : "resumed");
    queueMicrotask(this.pump.bind(this));
    return task;
  }

  async stop(id: number) {
    this.assertOwner();
    const task = this.store.get(id);
    if (!task) return null;
    if (
      task.desired === "stopped" &&
      task.phase !== "stopping" &&
      !task.sessionId &&
      !task.cleanupSessions.length
    )
      return task;
    // 先落盘用户停止意图。任何迟到回调都无法重新取得提交权。
    task.desired = "stopped";
    task.phase = "stopping";
    task.generation++;
    task.nextRetryAt = null;
    task.message = "已取消续发，正在中断并核对提交。";
    this.save(task, "stop_requested");
    const execution = this.executions.get(id);
    if (execution) await this.endExecution(execution, "stopped");
    else {
      task.slotHeld = false;
      let completed = false;
      try {
        this.writer.recover(task);
        completed = this.completeIfReady(task);
      } catch (error) {
        completed = false;
        task.unconfirmed = Math.max(1, task.unconfirmed);
        task.message = "已停止，提交核对待恢复：" + errorText(error);
      }
      if (task.sessionId) {
        task.cleanupSessions.push(task.sessionId);
        task.sessionId = null;
      }
      task.phase = task.unconfirmed ? "blocked" : completed ? "completed" : "stopped";
      task.message = task.unconfirmed
        ? "已停止，提交结果待核对。"
        : completed ? "全部字段已处理，当前会话已结束。" : "已停止；已确认的内容保留。";
      this.save(task, "stopped");
      if (task.cleanupSessions.length)
        await this.cleanupDetached(task.entityId);
      this.pump();
    }
    return this.store.get(id);
  }

  private pump() {
    if (this.disposed || !this.leader) return;
    const tasks = this.store.list().sort(function waitingOrder(a, b) {
      return a.queuedAt.localeCompare(b.queuedAt) || a.entityId - b.entityId;
    });
    // 失败只关闭连接，不交出名额；重试等待期间，排队任务也不能抢占。
    const occupied = new Set(this.executions.keys());
    for (const task of tasks) {
      if (task.slotHeld && task.desired === "running") occupied.add(task.entityId);
    }
    for (const task of tasks) {
      if (task.desired !== "running" || this.executions.has(task.entityId))
        continue;
      if (!["queued", "retrying"].includes(task.phase)) continue;
      if (!occupied.has(task.entityId) && occupied.size >= this.concurrency) continue;
      if (task.nextRetryAt && Date.parse(task.nextRetryAt) > Date.now())
        continue;
      occupied.add(task.entityId);
      this.launch(task);
    }
  }
  private launch(task: EntryTask) {
    task.slotHeld = true;
    try {
      this.assertOwner();
      if (!task.skillHash) task.skillHash = this.saveSkill();
      this.writer.recover(task);
      if (task.unconfirmed) throw new Error("存在未确认提交，将持续核对，确认前不重复写入。");
      if (this.completeIfReady(task)) {
        void this.cleanupDetached(task.entityId).finally(this.pump.bind(this));
        return;
      }
    } catch (error) {
      this.retry(task, error);
      return;
    }
    task.phase = "starting";
    task.attempt++;
    task.generation++;
    task.nextRetryAt = null;
    task.message = "正在连接 Codex，恢复当前词条。";
    this.save(task, "attempt_started");
    const temp = path.join(
      this.config.workspace,
      "tmp",
      String(task.entityId),
      task.runId,
    );
    let execution: Execution;
    const events: CodexEvents = {
      onNotification: (method, params) => {
        if (execution) this.notification(execution, method, params);
      },
      onRequest: (id, method, params) => {
        if (execution) this.toolRequest(execution, id, method, params);
      },
      onDisconnect: (error) => {
        if (execution) void this.failed(execution, error);
      },
    };
    try {
      fs.mkdirSync(temp, { recursive: true });
      const connection = this.createConnection(events, temp);
      execution = {
        entityId: task.entityId,
        generation: task.generation,
        connection,
        turnId: null,
        sending: false,
        ending: false,
        finishedTurns: new Set(),
        lastChecked: taskProgress(task).checked,
      };
      this.executions.set(task.entityId, execution);
      void this.connect(execution).catch((error) => {
        void this.failed(execution, error);
      });
    } catch (error) {
      this.retry(task, error);
    }
  }
  private current(execution: Execution) {
    if (
      this.disposed ||
      execution.ending ||
      this.executions.get(execution.entityId) !== execution
    )
      return null;
    const task = this.store.get(execution.entityId);
    if (
      !task ||
      task.generation !== execution.generation ||
      task.desired !== "running"
    )
      return null;
    return task;
  }
  private async cleanup(connection: CodexConnection, task: EntryTask) {
    const failed: string[] = [];
    let message = "";
    for (const sessionId of [...new Set(task.cleanupSessions)]) {
      try {
        await connection.request(
          "thread/delete",
          { threadId: sessionId },
          15000,
        );
      } catch (error) {
        const reason = errorText(error);
        if (!/not found|does not exist|already deleted/i.test(reason)) {
          failed.push(sessionId);
          message = reason;
        }
      }
    }
    // 异步清理期间停止操作可能更新任务，不能用旧快照覆盖停止意图。
    if (this.disposed) return;
    const latest = this.store.get(task.entityId)!;
    const attempted = new Set(task.cleanupSessions);
    latest.cleanupSessions = [
      ...new Set([
        ...latest.cleanupSessions.filter(function untouched(id) {
          return !attempted.has(id);
        }),
        ...failed,
      ]),
    ];
    latest.cleanupError = message;
    this.save(latest);
  }
  private async cleanupDetached(entityId: number) {
    const task = this.store.get(entityId);
    if (!task?.cleanupSessions.length) return;
    const temp = path.join(this.config.workspace, "tmp", "session-cleanup");
    fs.mkdirSync(temp, { recursive: true });
    let connection: CodexConnection | null = null;
    try {
      connection = this.createConnection(
        {
          onNotification: function ignore() {},
          onDisconnect: function ignore() {},
          onRequest: function reject(id) {
            connection?.rejectRequest(id, "此连接仅清理已结束的会话。");
          },
        },
        temp,
      );
      this.cleanupConnections.add(connection);
      await connection.initialize();
      if (this.disposed) return;
      await this.cleanup(connection, task);
    } catch (error) {
      if (this.disposed) return;
      const latest = this.store.get(entityId)!;
      latest.cleanupError = errorText(error);
      this.save(latest);
    } finally {
      connection?.close();
      if (connection) this.cleanupConnections.delete(connection);
    }
  }
  private async connect(execution: Execution) {
    await execution.connection.initialize();
    let task = this.current(execution);
    if (!task) return;
    if (task.cleanupSessions.length)
      await this.cleanup(execution.connection, task);
    task = this.current(execution);
    if (!task) return;
    const parameters = {
      model: task.model,
      cwd: this.config.workspace,
      approvalPolicy: "never",
      sandbox: "read-only",
      config: { web_search: "live" },
    };
    let response: Record<string, unknown>;
    if (task.sessionId) {
      execution.sessionRequest = execution.connection.request("thread/resume", {
        ...parameters,
        threadId: task.sessionId,
      });
      response = record(await execution.sessionRequest);
    } else {
      const skillFile = path.join(
        panelDirectory(this.config),
        "rules",
        task.skillHash + ".md",
      );
      const skill = fs.readFileSync(skillFile, "utf8");
      if (hash(skill) !== task.skillHash)
        throw new Error("技能快照校验失败。");
      execution.sessionRequest = execution.connection.request(
        "thread/start",
        {
          ...parameters,
          developerInstructions: skill,
          dynamicTools: researchTools,
        },
      );
      response = record(await execution.sessionRequest);
    }
    const thread = record(response.thread);
    const sessionId = String(thread.id || "");
    if (!sessionId) throw new Error("Codex 未返回会话 ID。");
    task = this.current(execution);
    if (!task) {
      const stopped = this.store.get(execution.entityId)!;
      // 停止正在等待创建请求结束，把迟到的会话交给同一个停止流程删除。
      if (execution.ending && this.executions.get(execution.entityId) === execution) {
        stopped.sessionId = sessionId;
        this.save(stopped, "stopping_session_bound");
        return;
      }
      stopped.cleanupSessions.push(sessionId);
      this.save(stopped);
      await this.cleanupDetached(stopped.entityId);
      execution.connection.close();
      return;
    }
    task.sessionId = sessionId;
    task.phase = "running";
    task.message = "正在核查字段，证据和结果会及时保存。";
    this.save(task, "session_bound");
    if (record(thread.status).type === "active")
      throw new Error("会话仍在执行，拒绝叠加新任务。");
    await this.send(execution);
  }
  private async send(execution: Execution) {
    const task = this.current(execution);
    if (!task || execution.sending) return;
    execution.sending = true;
    try {
      execution.turnRequest = execution.connection.request("turn/start", {
        threadId: task.sessionId,
        model: task.model,
        effort: task.reasoning,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: true },
        input: [
          {
            type: "text",
            text: `按照任务技能处理单个词条。词条 ID=${task.entityId}，名称=${task.name}，run_id=${task.runId}。先调用 entry_context，只处理 remainingFields。每个字段统一查证、纠错和补充，核查后立即 submit_field，全部结束后 finish_task。不要直接写库。`,
            text_elements: [],
          },
        ],
      });
      const response = record(await execution.turnRequest);
      const turn = record(response.turn);
      if (
        (this.current(execution) || execution.ending) &&
        turn.id &&
        !execution.finishedTurns.has(String(turn.id))
      )
        execution.turnId = String(turn.id);
      if (turn.status === "failed") throw new Error(JSON.stringify(turn.error));
    } finally {
      execution.sending = false;
    }
  }
  private notification(
    execution: Execution,
    method: string,
    params: Record<string, unknown>,
  ) {
    const task = this.current(execution);
    if (!task) return;
    if (task.sessionId && params.threadId && params.threadId !== task.sessionId)
      return;
    const turn = record(params.turn);
    if (method === "turn/started") execution.turnId = String(turn.id || "");
    if (method === "error" && params.willRetry === false) {
      void this.failed(execution, new Error(JSON.stringify(params.error)));
      return;
    }
    if (
      method !== "turn/completed" ||
      !turn.id ||
      execution.finishedTurns.has(String(turn.id))
    )
      return;
    execution.finishedTurns.add(String(turn.id));
    execution.turnId = null;
    if (turn.status === "failed" || turn.status === "interrupted") {
      void this.failed(
        execution,
        new Error(JSON.stringify(turn.error || turn.status)),
      );
      return;
    }
    try {
      if (this.completeIfReady(task)) {
        void this.endExecution(execution, "completed");
        return;
      }
    } catch (error) {
      void this.failed(execution, error);
      return;
    }
    const checked = taskProgress(task).checked;
    task.noProgress = checked > execution.lastChecked ? 0 : task.noProgress + 1;
    execution.lastChecked = checked;
    if (task.noProgress >= 3) {
      void this.failed(execution, new Error("连续没有新增字段结果，将更换会话继续处理。"), true);
      return;
    }
    task.message = "尚未完成，继续处理剩余字段。";
    this.save(task);
    this.scheduleContinuation(execution, 1500);
  }

  private scheduleContinuation(execution: Execution, delay: number) {
    execution.timer = setTimeout(() => {
      if (!this.current(execution)) return;
      if (execution.sending) {
        this.scheduleContinuation(execution, 250);
        return;
      }
      void this.send(execution).catch((error) => {
        void this.failed(execution, error);
      });
    }, delay);
  }

  context(id: number) {
    const task = this.store.get(id);
    const detail = readDetail(this.config, id);
    const remainingFields =
      task?.scope.filter(function remaining(key) {
        return !task.processedFields.includes(key) || !task.results[key]?.readback;
      }) || [];
    const batch = new Set(remainingFields.slice(0, 8));
    const fields = detail.fields
      .filter(function next(field) {
        return batch.has(field.key);
      })
      .map(function compact(field) {
        const rules = Object.fromEntries(
          Object.entries(field.rules).filter(function present(pair) {
            return pair[1] !== null && pair[1] !== "";
          }),
        );
        return { ...field, rules };
      });
    return {
      ...detail,
      fields,
      task: task
        ? { runId: task.runId, mode: task.mode, progress: taskProgress(task) }
        : null,
      remainingFields,
      instruction:
        "fields 仅含接下来的最多 8 个字段；逐项提交后再次调用 entry_context。核查时可以复用同一次原件阅读。",
    };
  }
  private toolRequest(
    execution: Execution,
    requestId: string | number,
    method: string,
    params: Record<string, unknown>,
  ) {
    const task = this.current(execution);
    if (!task) {
      execution.connection.rejectRequest(
        requestId,
        "任务已停止或执行已被替换。",
      );
      return;
    }
    if (method !== "item/tool/call") {
      execution.connection.rejectRequest(
        requestId,
        "采集任务仅允许只读研究和工作台工具；请记录无法推进的原因。",
      );
      return;
    }
    try {
      this.assertOwner();
      if (params.threadId !== task.sessionId)
        throw new Error("工具请求与当前会话不匹配。");
      const args = object(params.arguments);
      let result: unknown;
      if (params.tool === "entry_context") result = this.context(task.entityId);
      else if (params.tool === "entry_source") {
        const source = readSource(
          this.config,
          task.entityId,
          Number(args.sourceId),
        );
        const snapshot = String(source.snapshot);
        const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
        result = {
          ...source,
          snapshot: snapshot.slice(offset, offset + 16000),
          offset,
          nextOffset: offset + 16000 < snapshot.length ? offset + 16000 : null,
          totalLength: snapshot.length,
        };
      } else if (params.tool === "submit_field") {
        if (task.unconfirmed) {
          this.writer.recover(task);
          if (task.unconfirmed) throw new Error("有未确认提交，正在持续核对，确认前不重复写入。");
        }
        const alreadyChecked = task.processedFields.includes(String(args.field));
        result = this.writer.submit(task, args);
        if (!alreadyChecked) task.failures = 0;
        task.message = "已核查：" + String(args.field);
        this.save(task, "field_result");
      } else if (params.tool === "save_note") {
        const name = String(args.name || "");
        const text = String(args.text || "");
        if (
          !/^[a-zA-Z0-9_-]{1,100}\.(md|txt|json)$/.test(name) ||
          text.length > 2000000
        )
          throw new Error("笔记需要简单文件名和至多 2MB 文本。");
        const directory = path.join(
          panelDirectory(this.config),
          "notes",
          String(task.entityId),
          task.runId,
        );
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, randomUUID() + "-" + name);
        fs.writeFileSync(file, text, { flag: "wx" });
        result = { path: file };
      } else if (params.tool === "finish_task") {
        if (!this.completeIfReady(task))
          throw new Error(
            "尚未完成，请调用 entry_context 检查剩余字段或待确认提交。",
          );
        result = { completed: true };
      } else throw new Error("不支持的工作台工具。");
      execution.connection.respond(requestId, {
        success: true,
        contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
      });
      if (params.tool === "finish_task")
        execution.timer = setTimeout(() => {
          void this.endExecution(execution, "completed");
        }, 250);
    } catch (error) {
      const latest = this.store.get(task.entityId)!;
      latest.message = errorText(error);
      latest.unconfirmed = this.store.intents(task.entityId).length;
      this.save(latest, "tool_rejected");
      execution.connection.respond(requestId, {
        success: false,
        contentItems: [{ type: "inputText", text: errorText(error) }],
      });
    }
  }
  private completeIfReady(task: EntryTask) {
    if (
      task.scope.some(function missing(key) {
        return !task.processedFields.includes(key) || !task.results[key]?.readback;
      })
    )
      return false;
    this.writer.recover(task);
    if (task.unconfirmed) return false;
    const detail = readDetail(this.config, task.entityId);
    if (detail.dictionaryHash !== task.dictionaryHash) return false;
    task.filled = fieldProgress(detail.fields).filled;
    for (const field of detail.fields) {
      if (!task.scope.includes(field.key)) continue;
      const result = task.results[field.key];
      if (result && !isDeepStrictEqual(result.value, field.value)) {
        task.processedFields = task.processedFields.filter(function other(key) { return key !== field.key; });
        task.message = "字段被其他操作更新，需要重新核查：" + field.label;
        this.save(task, "external_change");
        return false;
      }
    }
    if (task.phase !== "completed") {
      task.phase = "completed";
      task.desired = "stopped";
      task.slotHeld = false;
      task.nextRetryAt = null;
      task.message = "全部字段已处理，写入已回读；空缺和待复核结果仍保留。";
      this.save(task, "task_completed");
    }
    return true;
  }
  private retry(task: EntryTask, error: unknown, retainSlot = true) {
    task.failures++;
    task.phase = "retrying";
    task.slotHeld = retainSlot;
    task.message = "保留执行名额，将继续重试：" + errorText(error);
    const delay = Math.min(60000, 5000 * 2 ** Math.min(task.failures - 1, 4));
    task.nextRetryAt = new Date(Date.now() + delay).toISOString();
    this.save(task, "execution_failed");
  }
  private async failed(execution: Execution, error: unknown, replaceSession = false) {
    const task = this.current(execution);
    if (!task) return;
    execution.ending = true;
    clearTimeout(execution.timer);
    execution.connection.close();
    this.executions.delete(task.entityId);
    try {
      this.writer.recover(task);
    } catch (failure) {
      task.message = errorText(failure);
      task.unconfirmed = Math.max(1, task.unconfirmed);
    }
    const message = errorText(error);
    if (replaceSession) task.noProgress = 0;
    if (
      (replaceSession || /413|context.*(limit|length|exceed)|payload too large|(?:thread|session|conversation).*(?:not found|does not exist)/i.test(
        message,
      )) &&
      task.sessionId
    ) {
      task.cleanupSessions.push(task.sessionId);
      task.sessionId = null;
    }
    this.retry(task, new Error((task.unconfirmed ? "提交需核对：" : "") + message));
    this.pump();
  }
  private async endExecution(
    execution: Execution,
    phase: "completed" | "stopped",
  ) {
    if (execution.ending) return execution.endingPromise;
    execution.ending = true;
    clearTimeout(execution.timer);
    execution.endingPromise = this.finishExecution(execution, phase);
    return execution.endingPromise;
  }
  private async finishExecution(
    execution: Execution,
    phase: "completed" | "stopped",
  ) {
    let task = this.store.get(execution.entityId)!;
    task.desired = "stopped";
    this.save(task);
    try {
      // 等待在途请求交回会话/执行 ID，再中断并删除；期间禁止重新开始。
      // 内部重连可能无限等待开始响应，因此用户停止最多等待 5 秒。
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const settled = Promise.all([
        execution.sessionRequest?.catch(function ignored() {}),
        execution.turnRequest?.catch(function ignored() {}),
      ]).then(function finished() { return true; });
      const deadline = new Promise<boolean>(function wait(resolve) {
        timeout = setTimeout(function expired() { resolve(false); }, 5000);
      });
      const acknowledged = await Promise.race([settled, deadline]);
      clearTimeout(timeout);
      if (!acknowledged) execution.connection.close();
      if (this.disposed) return;
      task = this.store.get(execution.entityId)!;
      if (acknowledged && task.sessionId && execution.turnId) {
        try {
          await execution.connection.request(
            "turn/interrupt",
            { threadId: task.sessionId, turnId: execution.turnId },
            5000,
          );
        } catch {
          /* 写入入口已失效，后续会关闭自己创建的执行进程。 */
        }
      }
      if (this.disposed) return;
      task = this.store.get(execution.entityId)!;
      try {
        this.writer.recover(task);
        if (this.completeIfReady(task)) phase = "completed";
      } catch (error) {
        task.phase = "blocked";
        task.message = "已停止，提交核对待恢复：" + errorText(error);
        this.save(task, "recovery_error");
      }
      // 核对失败也必须停掉并删除会话；结果仍由保存的写入意图继续追踪。
      if (task.sessionId && !task.cleanupSessions.includes(task.sessionId))
        task.cleanupSessions.push(task.sessionId);
      this.save(task);
      if (acknowledged) await this.cleanup(execution.connection, task);
      else await this.cleanupDetached(task.entityId);
    } finally {
      execution.connection.close();
      this.executions.delete(execution.entityId);
      if (!this.disposed) {
        task = this.store.get(execution.entityId)!;
        task.slotHeld = false;
        task.sessionId = null;
        if (task.phase !== "blocked") {
          task.phase = task.unconfirmed ? "blocked" : phase;
          if (task.phase === "stopped") {
            task.message = task.cleanupSessions.length
              ? "已停止；会话删除待重试，已确认的内容保留。"
              : "已停止并删除会话；已确认的内容保留。";
          }
        }
        this.save(task, "execution_ended");
        this.pump();
      }
    }
  }
  terminalTarget(id: string): TerminalTarget | null {
    const entityId = Number(id);
    const execution = this.executions.get(entityId);
    const task = this.store.get(entityId);
    if (!execution || execution.ending || !task?.sessionId) return null;
    const target = execution.connection.terminalTarget?.();
    return target ? { ...target, sessionId: task.sessionId } : null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const execution of this.executions.values()) {
      clearTimeout(execution.timer);
      execution.connection.close();
    }
    this.executions.clear();
    for (const connection of this.cleanupConnections) connection.close();
    this.cleanupConnections.clear();
    this.store.releaseService(this.owner);
    this.store.close();
  }
}
