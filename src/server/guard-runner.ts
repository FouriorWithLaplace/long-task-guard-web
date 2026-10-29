import { randomUUID } from "node:crypto";
import type { GuardLog, GuardRequest, GuardSettings, GuardSnapshot, SessionSummary } from "@/types/guard";
import type { CodexConnection, CodexEvents } from "./codex-client";

type MessageKind = "start" | "complete" | "retry";
type ConnectionFactory = (cwd: string, events: CodexEvents) => CodexConnection;

function record(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

export class GuardRunner {
  private createConnection: ConnectionFactory;
  private connection: CodexConnection | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private sending = false;
  private awaitingTurn = false;
  private finishedTurns = new Set<string>();
  private nextLogId = 0;
  private listeners = new Set<(snapshot: GuardSnapshot) => void>();
  private notificationQueued = false;
  private state: GuardSnapshot = {
    instanceId: randomUUID(), revision: 0, runId: 0, phase: "paused", settings: null,
    sessionTitle: "", projectPath: "", turnId: null,
    nextMessage: null, requests: [], logs: [],
  };

  constructor(createConnection: ConnectionFactory) {
    this.createConnection = createConnection;
  }

  snapshot(): GuardSnapshot {
    return structuredClone(this.state);
  }

  subscribe(listener: (snapshot: GuardSnapshot) => void): () => void {
    const listeners = this.listeners;
    listeners.add(listener);
    return function unsubscribe() { listeners.delete(listener); };
  }

  private changed() {
    this.state.revision++;
    if (this.listeners.size === 0 || this.notificationQueued) return;
    this.notificationQueued = true;
    queueMicrotask(this.publish.bind(this));
  }

  private publish() {
    this.notificationQueued = false;
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // 一个已断开的网页不会影响守护任务和其他网页。
        this.listeners.delete(listener);
      }
    }
  }

  async start(settings: GuardSettings, session: SessionSummary): Promise<GuardSnapshot> {
    if (this.state.phase !== "paused") {
      throw new Error("已有守护任务，请先暂停。" );
    }

    const generation = ++this.generation;
    this.state.runId++;
    this.state.settings = { ...settings };
    this.state.sessionTitle = session.title;
    this.state.projectPath = session.projectPath;
    this.state.phase = "starting";
    this.finishedTurns.clear();
    this.addLog("status", "system", "开始守护：" + session.title);
    await this.sendMessage("start", generation);
    return this.snapshot();
  }

  async pause(): Promise<GuardSnapshot> {
    if (this.state.phase === "paused" || this.state.phase === "stopping") {
      return this.snapshot();
    }

    // 先取消自动续发，再中断执行。旧请求晚到的通知不会重新启动任务。
    ++this.generation;
    this.cancelTimer();
    this.state.phase = "stopping";
    this.state.requests = [];
    this.addLog("status", "system", "正在暂停，已取消后续自动发送。" );
    const connection = this.connection;
    const turnId = this.state.turnId;
    this.connection = null;

    try {
      if (connection && turnId && this.state.settings) {
        await connection.request("turn/interrupt", {
          threadId: this.state.settings.sessionId,
          turnId: turnId,
        }, 5000);
      }
    } catch {
      // 中断请求无法送达时，仍会关闭自己启动的 Codex 进程。
    } finally {
      connection?.close();
      this.state.phase = "paused";
      this.state.turnId = null;
      this.sending = false;
      this.awaitingTurn = false;
      this.addLog("status", "system", "已暂停。" );
    }

    return this.snapshot();
  }

  respond(id: string | number, response: Record<string, unknown>): GuardSnapshot {
    const request = this.state.requests.find(function match(candidate) { return candidate.id === id; });

    if (!request || !this.connection) {
      throw new Error("这条请求已经结束。" );
    }

    if (request.kind === "approval") {
      if (response.decision !== "accept" && response.decision !== "decline") {
        throw new Error("请选择允许或拒绝。" );
      }
      this.connection.respond(id, { decision: response.decision });
    } else {
      const values = record(response.answers);
      const answers: Record<string, { answers: string[] }> = {};

      for (const question of request.questions) {
        const answer = text(values[question.id]).trim();
        if (answer === "") throw new Error("请填写问题的回答。" );
        answers[question.id] = { answers: [answer] };
      }

      this.connection.respond(id, { answers: answers });
    }

    this.removeRequest(id);
    this.addLog("status", "system", "已回复 Codex 的请求。" );
    return this.snapshot();
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.state.phase !== "paused" && this.state.phase !== "stopping";
  }

  private async connect(generation: number): Promise<CodexConnection> {
    if (this.connection) return this.connection;
    const settings = this.state.settings!;
    const connection = this.createConnection(this.state.projectPath, {
      onNotification: (method, params) => {
        if (this.isCurrent(generation) && this.connection === connection) {
          this.handleNotification(method, params, generation);
        }
      },
      onRequest: (id, method, params) => {
        if (this.isCurrent(generation) && this.connection === connection) {
          this.handleRequest(id, method, params);
        }
      },
      onDisconnect: (error) => {
        if (this.isCurrent(generation) && this.connection === connection) {
          this.connection = null;
          this.state.turnId = null;
          this.addLog("error", "system", error.message);
          this.scheduleNext("retry", generation);
        }
      },
    });
    this.connection = connection;
    await connection.initialize();
    if (!this.isCurrent(generation)) throw new Error("守护已暂停。" );

    const result = record(await connection.request("thread/resume", {
      threadId: settings.sessionId,
      cwd: this.state.projectPath,
      model: settings.model,
      excludeTurns: true,
    }));
    const thread = record(result.thread);

    if (thread.id !== settings.sessionId) throw new Error("Codex 恢复的会话与选择的会话不一致。" );
    if (record(thread.status).type === "active") {
      throw new Error("选中的会话正在执行，请等它结束后再开始守护。" );
    }

    return connection;
  }

  private async sendMessage(kind: MessageKind, generation: number) {
    if (!this.isCurrent(generation) || this.sending) return;
    this.cancelTimer();
    this.sending = true;
    this.state.phase = "starting";
    this.state.nextMessage = null;
    this.changed();

    try {
      const connection = await this.connect(generation);
      if (!this.isCurrent(generation)) return;
      const settings = this.state.settings!;
      let message = settings.startMessage;
      if (kind === "complete") message = settings.completeMessage;
      if (kind === "retry") message = settings.retryMessage;

      this.awaitingTurn = true;
      this.state.phase = "running";
      this.addLog("message", "user", message);
      const result = record(await connection.request("turn/start", {
        threadId: settings.sessionId,
        cwd: this.state.projectPath,
        model: settings.model,
        effort: settings.reasoning,
        input: [{ type: "text", text: message, text_elements: [] }],
      }));
      if (!this.isCurrent(generation)) return;
      const turn = record(result.turn);
      const turnId = text(turn.id);
      if (!turnId) throw new Error("Codex 没有返回执行轮次。" );

      // 极短回复可能在 turn/start 的响应前就发送 turn/completed。
      if (!this.finishedTurns.has(turnId)) {
        this.state.turnId = turnId;
        this.awaitingTurn = false;
        this.changed();
        if (turn.status === "completed" || turn.status === "failed" || turn.status === "interrupted") {
          this.finishTurn(turn, generation);
        }
      }
    } catch (error) {
      if (!this.isCurrent(generation) || this.state.nextMessage !== null) return;
      this.connection?.close();
      this.connection = null;
      this.state.turnId = null;
      let message = "Codex 执行中断。";
      if (error instanceof Error) message = error.message;
      this.addLog("error", "system", message);
      this.scheduleNext("retry", generation);
    } finally {
      if (generation === this.generation) {
        this.sending = false;
        this.awaitingTurn = false;
        // 完成通知可能先于发送请求的响应到达；响应结束后补发已到期的任务。
        if (this.state.nextMessage !== null && this.timer === null) {
          this.timer = setTimeout(this.dispatchNext.bind(this, generation), 0);
        }
      }
    }
  }

  private handleNotification(method: string, params: Record<string, unknown>, generation: number) {
    if (params.threadId !== this.state.settings?.sessionId) return;
    if (method === "serverRequest/resolved") {
      if (typeof params.requestId === "string" || typeof params.requestId === "number") {
        this.removeRequest(params.requestId);
      }
      return;
    }
    const turn = record(params.turn);
    const turnId = text(params.turnId) || text(turn.id);

    if (method === "turn/started" && this.awaitingTurn && !this.finishedTurns.has(turnId)) {
      this.state.turnId = turnId;
      this.awaitingTurn = false;
      this.changed();
    }

    if (!turnId || turnId !== this.state.turnId) return;

    if (method === "turn/completed") {
      this.finishTurn(turn, generation);
    } else if (method === "item/agentMessage/delta") {
      this.updateItem(turnId + ":" + text(params.itemId), "assistant", text(params.delta), true);
    } else if (method === "item/commandExecution/outputDelta") {
      this.updateItem(turnId + ":" + text(params.itemId), "tool", text(params.delta), true);
    } else if (method === "item/started" || method === "item/completed") {
      const item = record(params.item);
      const key = turnId + ":" + text(item.id);

      if (item.type === "agentMessage" && method === "item/completed") {
        this.updateItem(key, "assistant", text(item.text), false);
      } else if (item.type === "commandExecution") {
        let output = "$ " + text(item.command);
        if (typeof item.aggregatedOutput === "string") output += "\n" + item.aggregatedOutput;
        if (method === "item/completed") output += "\n退出码：" + String(item.exitCode ?? "未知");
        this.updateItem(key, "tool", output, false);
      } else if (item.type === "fileChange" && method === "item/completed") {
        const changes = Array.isArray(item.changes) ? item.changes : [];
        const paths = changes.map(function getPath(change) { return text(record(change).path); });
        this.updateItem(key, "tool", "文件修改：\n" + paths.join("\n"), false);
      }
    } else if (method === "error") {
      if (params.willRetry === false) {
        // 不等待可能迟到或缺失的 completed；关闭旧连接，避免重试与旧执行重叠。
        this.connection?.close();
        this.connection = null;
        this.finishTurn({ id: turnId, status: "failed", error: params.error }, generation);
      } else {
        this.addLog("error", "system", text(record(params.error).message) || "Codex 执行异常。" );
        // Codex 仍在自行重试时，本轮没有结束，不叠加新的消息。
      }
    }
  }

  private finishTurn(turn: Record<string, unknown>, generation: number) {
    const id = text(turn.id);
    if (!id || this.finishedTurns.has(id)) return;
    this.finishedTurns.add(id);
    if (this.finishedTurns.size > 1000) this.finishedTurns.delete(this.finishedTurns.values().next().value!);
    this.state.turnId = null;
    this.awaitingTurn = false;
    this.state.requests = [];

    if (turn.status === "completed") {
      this.addLog("status", "system", "本轮执行完成。" );
      this.scheduleNext("complete", generation);
    } else {
      const error = text(record(turn.error).message);
      this.addLog("error", "system", error || "本轮执行中断。" );
      this.scheduleNext("retry", generation);
    }
  }

  private scheduleNext(kind: "complete" | "retry", generation: number) {
    if (!this.isCurrent(generation)) return;
    this.cancelTimer();
    this.state.requests = [];
    const settings = this.state.settings!;
    let message = settings.completeMessage;

    if (kind === "retry") {
      message = settings.retryMessage;
    }

    if (message.trim() === "") {
      this.connection?.close();
      this.connection = null;
      this.state.phase = "paused";
      this.addLog("status", "system", "未设置后续发送内容，守护已暂停。" );
      return;
    }

    this.state.phase = "waiting";
    this.state.nextMessage = kind;
    let messageStatus = "立即发送正常结束后的消息。";
    if (kind === "retry") messageStatus = "立即发送中断重试消息。";
    this.addLog("status", "system", messageStatus);
    this.timer = setTimeout(this.dispatchNext.bind(this, generation), 0);
  }

  private dispatchNext(generation: number) {
    this.timer = null;
    if (!this.isCurrent(generation) || this.sending || this.state.nextMessage === null) return;
    void this.sendMessage(this.state.nextMessage, generation);
  }

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.state.nextMessage = null;
  }

  private handleRequest(id: string | number, method: string, params: Record<string, unknown>) {
    if (params.threadId !== this.state.settings?.sessionId) {
      this.connection?.rejectRequest(id, "请求不属于当前守护会话。" );
      return;
    }

    const request: GuardRequest = { id: id, kind: "approval", title: "Codex 请求授权", detail: "", questions: [] };

    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
      request.detail = [text(params.reason), text(params.command), text(params.cwd)].filter(Boolean).join("\n");
      if (method === "item/fileChange/requestApproval") request.title = "Codex 请求修改文件";
    } else if (method === "item/tool/requestUserInput" && Array.isArray(params.questions)) {
      request.kind = "input";
      request.title = "Codex 需要你的回答";
      for (const value of params.questions) {
        const question = record(value);
        const options = Array.isArray(question.options) ? question.options : [];
        request.questions.push({
          id: text(question.id), question: text(question.question), secret: question.isSecret === true,
          options: options.map(function getLabel(option) { return text(record(option).label); }),
        });
      }
    } else {
      this.connection?.rejectRequest(id, "当前界面不支持此交互：" + method);
      this.addLog("status", "system", "Codex 需要额外交互，守护已暂停：" + method);
      void this.pause();
      return;
    }

    this.state.requests.push(request);
    this.state.phase = "needsInput";
    this.addLog("status", "system", request.title);
  }

  private removeRequest(id: string | number) {
    this.state.requests = this.state.requests.filter(function keep(request) { return request.id !== id; });
    if (this.state.phase === "needsInput" && this.state.requests.length === 0) this.state.phase = "running";
    this.changed();
  }

  private addLog(kind: GuardLog["kind"], role: GuardLog["role"], message: string): GuardLog {
    const entry: GuardLog = { id: ++this.nextLogId, time: new Date().toISOString(), kind: kind, role: role, text: message.slice(-200000) };
    this.state.logs.push(entry);
    if (this.state.logs.length > 500) this.state.logs.shift();
    this.changed();
    return entry;
  }

  private updateItem(key: string, role: "assistant" | "tool", message: string, append: boolean) {
    let entry = this.state.logs.find(function match(log) { return log.itemKey === key; });

    if (!entry) {
      entry = this.addLog("message", role, "");
      entry.itemKey = key;
    }

    let nextText = message;
    if (append) nextText = entry.text + message;
    entry.text = nextText.slice(-200000);
    this.changed();
  }
}
