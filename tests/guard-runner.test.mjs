import assert from "node:assert/strict";
import test from "node:test";
import { GuardRunner } from "../src/server/guard-runner.ts";
import { GuardEventHub } from "../src/server/guard-event-hub.ts";
import { createGuardEventStream } from "../src/server/guard-events.ts";

const settings = {
  sessionId: "existing-thread", model: "chosen-model", reasoning: "high",
  startMessage: "Start task", retryMessage: "Retry task", completeMessage: "Continue task",
};
const session = { id: settings.sessionId, title: "Existing session", projectPath: process.cwd() };

async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}

function deferred() {
  let resolve;
  const promise = new Promise(function (done) { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const clients = [];
  const calls = [];
  let turnCounter = 0;
  const runner = new GuardRunner(function createConnection(cwd, events) {
    assert.equal(cwd, session.projectPath);
    const client = {
      events, closed: false,
      async initialize() {
        calls.push({ method: "initialize" });
        if (options.initialize) await options.initialize.promise;
      },
      async request(method, params) {
        calls.push({ method, params });
        if (method === "thread/resume") {
          return { thread: { id: settings.sessionId, status: { type: options.busy ? "active" : "idle" } } };
        }
        if (method === "turn/start") {
          if (options.startFailures > 0) {
            options.startFailures--;
            throw new Error("Simulated send failure");
          }
          const turn = { id: "turn-" + ++turnCounter, status: "inProgress" };
          if (!options.noStarted) client.notify("turn/started", { turn });
          if (options.earlyCompletion) client.complete(turn.id);
          if (options.startResponse) await options.startResponse.promise;
          return { turn };
        }
        if (method === "turn/interrupt") {
          client.complete(params.turnId, "interrupted");
          return {};
        }
        throw new Error("Unexpected method: " + method);
      },
      respond(id, result) { calls.push({ method: "response", id, result }); },
      rejectRequest(id, message) { calls.push({ method: "rejection", id, message }); },
      close() { client.closed = true; },
      notify(method, params) { events.onNotification(method, { threadId: settings.sessionId, ...params }); },
      complete(id, status = "completed") { client.notify("turn/completed", { turn: { id, status } }); },
    };
    clients.push(client);
    return client;
  });
  return {
    runner, calls, clients,
    starts() { return calls.filter(function (call) { return call.method === "turn/start"; }); },
  };
}

test("resumes selected session, sends selected model/effort, merges real streamed replies", async function () {
  const { runner, clients, calls, starts } = fixture();
  try {
    assert.equal(runner.snapshot().phase, "paused");
    assert.equal(clients.length, 0);
    await runner.start(settings, session);
    assert.equal(runner.snapshot().phase, "running");
    assert.equal(calls[1].method, "thread/resume");
    assert.equal(calls[1].params.threadId, settings.sessionId);
    assert.deepEqual(starts()[0].params, {
      threadId: settings.sessionId, cwd: session.projectPath, model: settings.model, effort: settings.reasoning,
      input: [{ type: "text", text: settings.startMessage, text_elements: [] }],
    });
    const client = clients[0];
    client.notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "reply", delta: "Hello " });
    client.notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "reply", delta: "world" });
    client.notify("item/completed", { turnId: "turn-1", item: { id: "reply", type: "agentMessage", text: "Hello world!" } });
    const replies = runner.snapshot().logs.filter(function (log) { return log.role === "assistant"; });
    assert.equal(replies.length, 1);
    assert.equal(replies[0].text, "Hello world!");
    client.notify("item/agentMessage/delta", { threadId: "different-thread", turnId: "turn-1", itemId: "bad", delta: "Ignore me" });
    assert.ok(!runner.snapshot().logs.some(function (log) { return log.text === "Ignore me"; }));
    await assert.rejects(runner.start(settings, session));
    assert.equal(starts().length, 1);
  } finally { await runner.pause(); }
});

test("SSE pushes startup and partial AI progress before start resolves and without pausing", { timeout: 3000 }, async function () {
  const initialize = deferred();
  const startResponse = deferred();
  const { runner, clients } = fixture({ initialize, startResponse });
  const reader = createGuardEventStream(new GuardEventHub(runner), new AbortController().signal).getReader();
  let startFinished = false;
  let started;

  async function nextSnapshot() {
    const { value } = await reader.read();
    const frame = new TextDecoder().decode(value);
    return JSON.parse(frame.match(/^data: (.+)$/m)[1]);
  }

  try {
    await nextSnapshot();
    started = runner.start(settings, session).then(function () { startFinished = true; });
    assert.equal((await nextSnapshot()).phase, "starting");
    assert.equal(startFinished, false);
    initialize.resolve();
    await settle();
    assert.equal((await nextSnapshot()).phase, "running");

    clients[0].notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "progress", delta: "Checking" });
    assert.equal((await nextSnapshot()).logs.at(-1).text, "Checking");
    clients[0].notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "progress", delta: " the project." });
    assert.equal((await nextSnapshot()).logs.at(-1).text, "Checking the project.");
    assert.equal(startFinished, false);
    assert.equal(runner.snapshot().phase, "running");
  } finally {
    initialize.resolve();
    startResponse.resolve();
    await started;
    await reader.cancel();
    await runner.pause();
  }
});

test("tool activity is pushed immediately, updated in place, and never includes raw details", async function () {
  const { runner, clients } = fixture();
  const snapshots = [];
  const unsubscribe = runner.subscribe(function receive(snapshot) { snapshots.push(snapshot); });
  try {
    await runner.start(settings, session);
    const client = clients[0];
    const item = {
      id: "command", type: "commandExecution", command: "secret-command --private-arguments",
      commandActions: [{ type: "search", command: "secret-command", query: "private-query", path: "private-path" }],
    };
    client.notify("item/started", { turnId: "turn-1", item });
    await settle();
    const started = snapshots.at(-1).logs.at(-1);
    assert.equal(started.text, "搜索代码");
    assert.equal(started.activityStatus, "running");
    assert.equal(snapshots.at(-1).phase, "running");
    const revision = runner.snapshot().revision;
    client.notify("item/commandExecution/outputDelta", { turnId: "turn-1", itemId: "command", delta: "Large detailed tool output" });
    client.notify("item/fileChange/patchUpdated", { turnId: "turn-1", itemId: "change", patch: "private-patch" });
    assert.equal(runner.snapshot().revision, revision);
    const finished = { ...item, status: "completed", aggregatedOutput: "Large detailed tool output", exitCode: 0 };
    client.notify("item/completed", { turnId: "turn-1", item: finished });
    const completed = runner.snapshot().logs.at(-1);
    assert.equal(completed.id, started.id);
    assert.equal(completed.activityStatus, "completed");
    const afterCompletion = runner.snapshot().revision;
    client.notify("item/completed", { turnId: "turn-1", item: finished });
    client.notify("item/started", { turnId: "turn-1", item });
    assert.equal(runner.snapshot().revision, afterCompletion);
    client.notify("item/completed", { turnId: "turn-1", item: { id: "change", type: "fileChange", changes: [{ path: "private-file.ts", diff: "private-diff" }] } });
    assert.equal(runner.snapshot().logs.at(-1).text, "修改文件");
    const serialized = JSON.stringify(runner.snapshot());
    for (const secret of ["secret-command", "private-arguments", "private-query", "private-path", "private-patch", "private-file.ts", "private-diff", "Large detailed tool output"]) {
      assert.ok(!serialized.includes(secret), "must omit " + secret);
    }

    client.notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "progress", delta: "Checking the project structure." });
    assert.equal(runner.snapshot().logs.at(-1).text, "Checking the project structure.");
  } finally { unsubscribe(); await runner.pause(); }
});

test("activity descriptions use structured actions and preserve actual failure or rejection", async function () {
  const { runner, clients } = fixture();
  try {
    await runner.start(settings, session);
    const items = [
      [{ type: "commandExecution", commandActions: [{ type: "read" }, { type: "listFiles" }] }, "读取文件、浏览工程目录"],
      [{ type: "commandExecution", command: "arbitrary command" }, "执行命令"],
      [{ type: "webSearch", query: "private-query" }, "搜索网页"],
      [{ type: "mcpToolCall", arguments: { private: "argument" } }, "调用外部工具"],
      [{ type: "dynamicToolCall", success: false }, "调用工具"],
      [{ type: "collabAgentToolCall" }, "协作处理任务"],
    ];
    for (let index = 0; index < items.length; index++) {
      const [item, description] = items[index];
      clients[0].notify("item/completed", { turnId: "turn-1", item: { id: "tool-" + index, ...item } });
      assert.equal(runner.snapshot().logs.at(-1).text, description);
    }
    assert.equal(runner.snapshot().logs.find(log => log.itemKey?.endsWith("tool-4")).activityStatus, "failed");
    for (const status of ["failed", "declined", "interrupted"]) {
      clients[0].notify("item/completed", { turnId: "turn-1", item: { id: status, type: "fileChange", status } });
      assert.equal(runner.snapshot().logs.at(-1).activityStatus, status);
    }
    clients[0].notify("item/completed", { turnId: "turn-1", item: { id: "exit-failure", type: "commandExecution", status: "completed", exitCode: 1 } });
    assert.equal(runner.snapshot().logs.at(-1).activityStatus, "failed");
  } finally { await runner.pause(); }
});

test("plan steps update in place, skip future steps, and drop verbose explanations", async function () {
  const { runner, clients } = fixture();
  try {
    await runner.start(settings, session);
    const plan = [
      { step: "Locate display issues. Extra private detail.", status: "inProgress" },
      { step: "Apply changes", status: "pending" },
    ];
    clients[0].notify("turn/plan/updated", { turnId: "turn-1", explanation: "private-explanation", plan });
    const first = runner.snapshot().logs.at(-1);
    assert.equal(first.text, "Locate display issues.");
    assert.equal(first.activityStatus, "running");
    const revision = runner.snapshot().revision;
    clients[0].notify("turn/plan/updated", { turnId: "turn-1", plan });
    assert.equal(runner.snapshot().revision, revision);
    plan[0].status = "completed";
    plan[1].status = "inProgress";
    clients[0].notify("turn/plan/updated", { turnId: "turn-1", plan });
    const progress = runner.snapshot().logs.filter(log => log.itemKey?.includes(":plan:"));
    assert.equal(progress.length, 2);
    assert.equal(progress[0].id, first.id);
    assert.equal(progress[0].activityStatus, "completed");
    assert.equal(progress[1].text, "Apply changes");
    assert.equal(progress[1].activityStatus, "running");
    assert.ok(!JSON.stringify(runner.snapshot()).includes("private"));
    clients[0].notify("turn/plan/updated", { turnId: "turn-1", plan: [] });
    assert.equal(runner.snapshot().logs.at(-1).activityStatus, "ended");
  } finally { await runner.pause(); }
});

test("reasoning summaries stream their short topic, ignore raw reasoning, and deduplicate final summaries", async function () {
  const { runner, clients } = fixture();
  try {
    await runner.start(settings, session);
    const params = { turnId: "turn-1", itemId: "reason", summaryIndex: 0 };
    clients[0].notify("item/reasoning/summaryTextDelta", { ...params, delta: "**Locating" });
    assert.equal(runner.snapshot().logs.at(-1).text, "Locating");
    clients[0].notify("item/reasoning/summaryTextDelta", { ...params, delta: " display issues**\n\nprivate-summary-details" });
    const summary = runner.snapshot().logs.at(-1);
    assert.equal(summary.text, "Locating display issues");
    const revision = runner.snapshot().revision;
    clients[0].notify("item/reasoning/textDelta", { ...params, delta: "private-raw-reasoning" });
    assert.equal(runner.snapshot().revision, revision);
    clients[0].notify("item/completed", { turnId: "turn-1", item: {
      id: "reason", type: "reasoning", summary: ["**Locating display issues**\n\nprivate-summary-details"], content: ["private-raw-reasoning"],
    } });
    assert.equal(runner.snapshot().logs.at(-1).id, summary.id);
    assert.equal(runner.snapshot().revision, revision);
    assert.ok(!JSON.stringify(runner.snapshot()).includes("private"));
  } finally { await runner.pause(); }
});

test("pause and disconnection stop activity indicators without claiming success", async function () {
  const { runner, clients } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].notify("item/started", { turnId: "turn-1", item: { id: "paused-command", type: "commandExecution" } });
    await runner.pause();
    assert.equal(runner.snapshot().logs.find(log => log.role === "tool").activityStatus, "interrupted");
    await runner.start(settings, session);
    clients[1].notify("item/started", { turnId: "turn-2", item: { id: "disconnected-command", type: "commandExecution" } });
    clients[1].events.onDisconnect(new Error("Fixture disconnect"));
    assert.ok(runner.snapshot().logs.filter(log => log.role === "tool").every(log => log.activityStatus === "interrupted"));
  } finally { await runner.pause(); }
});

test("turn completion stops remaining indicators and ignores foreign or stale activity", async function () {
  const { runner, clients } = fixture();
  try {
    await runner.start({ ...settings, completeMessage: "" }, session);
    clients[0].notify("item/started", { threadId: "other-thread", turnId: "turn-1", item: { id: "foreign", type: "fileChange" } });
    clients[0].notify("item/started", { turnId: "other-turn", item: { id: "stale", type: "fileChange" } });
    assert.ok(!runner.snapshot().logs.some(log => log.role === "tool"));
    clients[0].notify("item/started", { turnId: "turn-1", item: { id: "active", type: "fileChange" } });
    clients[0].complete("turn-1");
    const activity = runner.snapshot().logs.find(log => log.role === "tool");
    assert.equal(activity.activityStatus, "ended");
    assert.equal(runner.snapshot().phase, "paused");
  } finally { await runner.pause(); }
});

test("restarting after automatic pause does not wait for the previous start acknowledgement", async function () {
  const startResponse = deferred();
  const { runner, clients, starts } = fixture({ earlyCompletion: true, startResponse });
  const selected = { ...settings, completeMessage: "" };
  const firstStart = runner.start(selected, session);
  let secondStart;
  try {
    await settle();
    assert.equal(runner.snapshot().phase, "paused");
    secondStart = runner.start(selected, session);
    await settle();
    assert.equal(clients.length, 2);
    assert.equal(starts().length, 2);
    assert.equal(runner.snapshot().runId, 2);
  } finally {
    startResponse.resolve();
    await Promise.all([firstStart, secondStart]);
    await runner.pause();
  }
});

test("normal completion and failure continue immediately; duplicate events do not duplicate sends", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100000 });
  const { runner, clients, starts } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].complete("turn-1");
    clients[0].complete("turn-1");
    assert.equal(starts().length, 1);
    t.mock.timers.tick(0);
    await settle();
    assert.equal(starts().length, 2);
    assert.equal(starts()[1].params.input[0].text, settings.completeMessage);

    clients[0].notify("error", { turnId: "turn-2", error: { message: "Transient" }, willRetry: true });
    t.mock.timers.tick(100000);
    await settle();
    assert.equal(starts().length, 2);
    clients[0].complete("turn-2", "failed");
    clients[0].complete("turn-2", "failed");
    assert.equal(runner.snapshot().nextMessage, "retry");
    assert.equal(runner.snapshot().phase, "waiting");
    t.mock.timers.tick(0);
    await settle();
    assert.equal(starts().length, 3);
    assert.equal(starts()[2].params.input[0].text, settings.retryMessage);
    assert.equal(clients.length, 1);
  } finally { await runner.pause(); }
});

test("pause interrupts active turn and late completion cannot restart the guard", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, calls, starts } = fixture();
  await runner.start(settings, session);
  await runner.pause();
  assert.deepEqual(calls.find(function (call) { return call.method === "turn/interrupt"; }).params,
    { threadId: settings.sessionId, turnId: "turn-1" });
  assert.equal(clients[0].closed, true);
  clients[0].complete("turn-1");
  clients[0].events.onDisconnect(new Error("Late process exit"));
  t.mock.timers.tick(300000);
  await settle();
  assert.equal(starts().length, 1);
  assert.equal(runner.snapshot().phase, "paused");
  assert.equal(runner.snapshot().nextMessage, null);
});

test("pause during waiting cancels timer; restarting uses the new start message", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, starts } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].complete("turn-1");
    await runner.pause();
    t.mock.timers.tick(300000);
    await settle();
    assert.equal(starts().length, 1);
    await runner.start({ ...settings, startMessage: "New start" }, session);
    assert.equal(starts()[1].params.input[0].text, "New start");
  } finally { await runner.pause(); }
});

test("pause during initialization prevents resume and sending", async function () {
  const initialize = deferred();
  const { runner, clients, calls, starts } = fixture({ initialize });
  const starting = runner.start(settings, session);
  await runner.pause();
  initialize.resolve();
  await starting;
  assert.equal(clients[0].closed, true);
  assert.equal(starts().length, 0);
  assert.equal(calls.length, 1);
  assert.equal(runner.snapshot().phase, "paused");
});

test("pause during pending turn/start closes owned connection and ignores late acknowledgement", async function () {
  const startResponse = deferred();
  const { runner, clients, starts } = fixture({ startResponse, noStarted: true });
  const starting = runner.start(settings, session);
  await settle();
  assert.equal(starts().length, 1);
  await runner.pause();
  startResponse.resolve();
  await starting;
  clients[0].notify("turn/started", { turn: { id: "turn-1", status: "inProgress" } });
  assert.equal(clients[0].closed, true);
  assert.equal(runner.snapshot().phase, "paused");
  assert.equal(runner.snapshot().turnId, null);
});

test("disconnect immediately resumes the same session on a new connection", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, starts, calls } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].events.onDisconnect(new Error("Connection lost"));
    assert.equal(runner.snapshot().phase, "waiting");
    assert.equal(runner.snapshot().phase, "waiting");
    t.mock.timers.tick(0);
    await settle();
    assert.equal(clients.length, 2);
    assert.equal(starts().length, 2);
    assert.equal(calls.filter(function (call) { return call.method === "thread/resume"; }).length, 2);
    clients[0].complete("turn-1");
    assert.equal(runner.snapshot().phase, "running");
    assert.equal(runner.snapshot().turnId, "turn-2");
  } finally { await runner.pause(); }
});

test("unexpected interruption retries immediately and pause still cancels a queued retry", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, starts } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].complete("turn-1", "interrupted");
    assert.equal(runner.snapshot().phase, "waiting");
    t.mock.timers.tick(0);
    await settle();
    assert.equal(starts().length, 2);
    assert.equal(starts()[1].params.input[0].text, settings.retryMessage);

    clients[0].complete("turn-2", "interrupted");
    await runner.pause();
    t.mock.timers.tick(0);
    await settle();
    assert.equal(starts().length, 2);
    assert.equal(runner.snapshot().phase, "paused");
  } finally { await runner.pause(); }
});

test("send failure immediately reconnects and retries", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, starts } = fixture({ startFailures: 1 });
  try {
    await runner.start(settings, session);
    assert.equal(clients[0].closed, true);
    assert.equal(runner.snapshot().phase, "waiting");
    t.mock.timers.tick(0);
    await settle();
    assert.equal(clients.length, 2);
    assert.equal(starts().length, 2);
    assert.equal(starts()[1].params.input[0].text, settings.retryMessage);
    assert.equal(runner.snapshot().phase, "running");
  } finally { await runner.pause(); }
});

test("final error without completion immediately reconnects and sends retry only once", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner, clients, starts } = fixture();
  try {
    await runner.start(settings, session);
    clients[0].notify("error", { turnId: "turn-1", error: { message: "Final failure" }, willRetry: false });
    assert.equal(clients[0].closed, true);
    assert.equal(runner.snapshot().phase, "waiting");
    clients[0].complete("turn-1", "failed");
    t.mock.timers.tick(0);
    await settle();
    assert.equal(clients.length, 2);
    assert.equal(starts().length, 2);
    assert.equal(starts()[1].params.input[0].text, settings.retryMessage);
  } finally { await runner.pause(); }
});

test("immediate retry is not lost when failed completion precedes turn/start acknowledgement", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const startResponse = deferred();
  const { runner, clients, starts } = fixture({ startResponse });
  const starting = runner.start(settings, session);
  await settle();
  clients[0].complete("turn-1", "failed");
  t.mock.timers.tick(0);
  await settle();
  assert.equal(starts().length, 1);
  startResponse.resolve();
  await starting;
  try {
    t.mock.timers.tick(0);
    await settle();
    assert.equal(starts().length, 2);
    assert.equal(starts()[1].params.input[0].text, settings.retryMessage);
  } finally { await runner.pause(); }
});

test("empty follow-up pauses instead of sending empty messages", async function () {
  const { runner, clients, starts } = fixture();
  await runner.start({ ...settings, completeMessage: "" }, session);
  clients[0].complete("turn-1");
  assert.equal(runner.snapshot().phase, "paused");
  assert.equal(starts().length, 1);
  assert.equal(clients[0].closed, true);
});

test("completion before turn/start acknowledgement keeps the scheduled continuation", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { runner } = fixture({ earlyCompletion: true });
  try {
    await runner.start(settings, session);
    assert.equal(runner.snapshot().phase, "waiting");
    assert.equal(runner.snapshot().turnId, null);
    assert.equal(runner.snapshot().nextMessage, "complete");
  } finally { await runner.pause(); }
});

test("actual approval and question requests wait for the user; resolved requests disappear", async function () {
  const { runner, clients, calls } = fixture();
  try {
    await runner.start(settings, session);
    const client = clients[0];
    client.events.onRequest(7, "item/commandExecution/requestApproval", {
      threadId: settings.sessionId, turnId: "turn-1", command: "example-command", reason: "Needs permission",
    });
    assert.equal(runner.snapshot().phase, "needsInput");
    runner.respond(7, { decision: "accept" });
    assert.deepEqual(calls.at(-1), { method: "response", id: 7, result: { decision: "accept" } });
    assert.equal(runner.snapshot().phase, "running");
    client.events.onRequest("question", "item/tool/requestUserInput", {
      threadId: settings.sessionId, turnId: "turn-1", questions: [{ id: "choice", question: "Choose?", options: [{ label: "A" }], isSecret: false }],
    });
    runner.respond("question", { answers: { choice: "A" } });
    assert.deepEqual(calls.at(-1).result, { answers: { choice: { answers: ["A"] } } });
    client.events.onRequest(8, "item/fileChange/requestApproval", { threadId: settings.sessionId, turnId: "turn-1" });
    client.notify("serverRequest/resolved", { requestId: 8 });
    assert.equal(runner.snapshot().requests.length, 0);
    assert.equal(runner.snapshot().phase, "running");
  } finally { await runner.pause(); }
});

test("does not inject a message into an already active session", async function () {
  const { runner, clients, starts } = fixture({ busy: true });
  try {
    await runner.start(settings, session);
    assert.equal(starts().length, 0);
    assert.equal(clients[0].closed, true);
    assert.equal(runner.snapshot().phase, "waiting");
  } finally { await runner.pause(); }
});

test("subscribers get coalesced live output, and disconnecting a page does not stop the guard", async function () {
  const { runner, clients, starts } = fixture();
  const snapshots = [];
  const stopListening = runner.subscribe(function receive(snapshot) { snapshots.push(snapshot); });
  runner.subscribe(function disconnectedPage() { throw new Error("Page closed"); });
  try {
    assert.equal(starts().length, 0);
    await runner.start(settings, session);
    await settle();
    const before = snapshots.length;
    clients[0].notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "live", delta: "Hello " });
    clients[0].notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "live", delta: "world" });
    await settle();
    assert.equal(snapshots.length, before + 1);
    assert.equal(snapshots.at(-1).logs.at(-1).text, "Hello world");
    stopListening();
    const count = snapshots.length;
    clients[0].notify("item/agentMessage/delta", { turnId: "turn-1", itemId: "live", delta: "!" });
    await settle();
    assert.equal(snapshots.length, count);
    assert.equal(runner.snapshot().phase, "running");
    assert.equal(runner.snapshot().logs.at(-1).text, "Hello world!");
  } finally { stopListening(); await runner.pause(); }
});
