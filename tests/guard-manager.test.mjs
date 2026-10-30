import assert from "node:assert/strict";
import test from "node:test";
import { GuardManager } from "../src/server/guard-manager.ts";
import { GuardRunner } from "../src/server/guard-runner.ts";
import { createGuardEventStream } from "../src/server/guard-events.ts";

function deferred() {
  let resolve;
  const promise = new Promise(function wait(done) { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

function task(id) {
  return {
    settings: { sessionId: id, model: "model", reasoning: "high", startMessage: "Start " + id, retryMessage: "", completeMessage: "" },
    session: { id: id, title: "会话 " + id, projectPath: process.cwd() },
  };
}

function fixture(options = {}) {
  const clients = [];
  const runners = [];
  let turnNumber = 0;
  const manager = new GuardManager(function createRunner() {
    const runner = new GuardRunner(function createConnection(_cwd, events) {
      const client = {
        closed: false, threadId: "", turnId: "", interrupts: 0, events: events,
        async initialize() { if (options.initialize) await options.initialize.promise; },
        async request(method, params) {
          if (method === "thread/resume") {
            client.threadId = params.threadId;
            return { thread: { id: params.threadId, status: { type: "idle" } } };
          }
          if (method === "turn/start") {
            client.turnId = "turn-" + ++turnNumber;
            client.notify("turn/started", { turn: { id: client.turnId } });
            return { turn: { id: client.turnId, status: "inProgress" } };
          }
          if (method === "turn/interrupt") {
            client.interrupts++;
            if (options.interrupt) await options.interrupt.promise;
            return {};
          }
          throw new Error("Unexpected method " + method);
        },
        close() { client.closed = true; },
        respond() {},
        rejectRequest() {},
        notify(method, params) { events.onNotification(method, { threadId: client.threadId, turnId: client.turnId, ...params }); },
      };
      clients.push(client);
      return client;
    });
    runners.push(runner);
    return runner;
  });
  return { manager, clients, runners };
}

test("independent guards run concurrently and their messages and pause state stay isolated", async function () {
  const { manager, clients } = fixture();
  const first = task("one");
  const second = task("two");
  const [one, two] = await Promise.all([manager.create(first.settings, first.session), manager.create(second.settings, second.session)]);
  try {
    assert.notEqual(one.id, two.id);
    assert.notEqual(one.instanceId, two.instanceId);
    assert.equal(manager.snapshot().guards.length, 2);
    clients[0].notify("item/agentMessage/delta", { itemId: "reply", delta: "Only first guard" });
    assert.ok(manager.get(one.id).logs.some(log => log.text === "Only first guard"));
    assert.ok(!manager.get(two.id).logs.some(log => log.text === "Only first guard"));
    await manager.pause(one.id);
    assert.equal(clients[0].closed, true);
    assert.equal(clients[1].closed, false);
    assert.equal(manager.get(two.id).phase, "running");
    const restarted = await manager.start(one.id, first.settings, first.session);
    assert.equal(restarted.id, one.id);
    assert.equal(restarted.runId, 2);
    assert.equal(restarted.logs.at(-1).text, first.settings.startMessage);
  } finally {
    await Promise.all([manager.remove(one.id), manager.remove(two.id)]);
  }
});

test("simultaneous creates reserve the session before Codex initialization resolves", async function () {
  const initialize = deferred();
  const { manager, clients } = fixture({ initialize });
  const selected = task("shared");
  const creating = manager.create(selected.settings, selected.session);
  try {
    assert.equal(manager.snapshot().guards[0].phase, "starting");
    await assert.rejects(manager.create(selected.settings, selected.session), { status: 409 });
    assert.equal(manager.snapshot().guards.length, 1);
    assert.equal(clients.length, 1);
  } finally {
    initialize.resolve();
    const created = await creating;
    await manager.remove(created.id);
  }
});

test("paused guards may share a session, but only one can be started", async function () {
  const { manager } = fixture();
  const selected = task("shared");
  const one = await manager.create(selected.settings, selected.session);
  await manager.pause(one.id);
  const two = await manager.create(selected.settings, selected.session);
  await assert.rejects(manager.start(one.id, selected.settings, selected.session), { status: 409 });
  await manager.pause(two.id);
  try {
    const outcomes = await Promise.allSettled([
      manager.start(one.id, selected.settings, selected.session),
      manager.start(two.id, selected.settings, selected.session),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected" && result.reason.status === 409).length, 1);
  } finally {
    await Promise.all([manager.remove(one.id), manager.remove(two.id)]);
  }
});

test("delete waits for an existing pause and rejects starts until the guard is removed", async function () {
  const interrupt = deferred();
  const { manager, clients } = fixture({ interrupt });
  const selected = task("one");
  const created = await manager.create(selected.settings, selected.session);
  const pausing = manager.pause(created.id);
  let removed = false;
  const deleting = manager.remove(created.id).then(function markRemoved() { removed = true; });
  const duplicateDelete = manager.remove(created.id);
  try {
    await settle();
    assert.equal(removed, false);
    assert.equal(manager.get(created.id).deleting, true);
    assert.equal(clients[0].closed, false);
    assert.equal(clients[0].interrupts, 1);
    await assert.rejects(manager.start(created.id, selected.settings, selected.session), { status: 409 });
    await assert.rejects(manager.create(selected.settings, selected.session), { status: 409 });
  } finally {
    interrupt.resolve();
    // 删除可能先于暂停 HTTP 响应结束；暂停不得再返回已删除的记录。
    await Promise.allSettled([pausing, deleting, duplicateDelete]);
  }
  assert.equal(clients[0].closed, true);
  assert.throws(function missing() { manager.get(created.id); }, { status: 404 });
  assert.equal(manager.snapshot().guards.length, 0);
  clients[0].notify("turn/completed", { turn: { id: clients[0].turnId, status: "completed" } });
  await settle();
  assert.equal(manager.snapshot().guards.length, 0);
});

test("deleting during initialization prevents late initialization from sending a turn", async function () {
  const initialize = deferred();
  const { manager, clients } = fixture({ initialize });
  const selected = task("initializing");
  const creating = manager.create(selected.settings, selected.session);
  const id = manager.snapshot().guards[0].id;
  await manager.remove(id);
  initialize.resolve();
  await assert.rejects(creating, { status: 404 });
  assert.equal(clients[0].closed, true);
  assert.equal(clients[0].turnId, "");
  assert.equal(manager.snapshot().guards.length, 0);
});

test("failed pause retains the guard, clears deleting state, and permits a later delete", async function () {
  const { manager, runners } = fixture();
  const selected = task("one");
  const created = await manager.create(selected.settings, selected.session);
  const originalPause = runners[0].pause.bind(runners[0]);
  runners[0].pause = async function failPause() { throw new Error("Pause failed"); };
  await assert.rejects(manager.remove(created.id), /Pause failed/);
  assert.equal(manager.get(created.id).deleting, false);
  runners[0].pause = originalPause;
  await manager.remove(created.id);
  assert.equal(manager.snapshot().guards.length, 0);
});

test("one SSE connection observes all guards, removal, and reconnect without starting work", { timeout: 3000 }, async function () {
  const { manager, clients } = fixture();
  const reader = createGuardEventStream(manager, new AbortController().signal).getReader();
  async function nextSnapshot() {
    const { value } = await reader.read();
    return JSON.parse(new TextDecoder().decode(value).match(/^data: (.+)$/m)[1]);
  }
  let one;
  try {
    assert.equal((await nextSnapshot()).guards.length, 0);
    const selected = task("one");
    one = await manager.create(selected.settings, selected.session);
    await settle();
    // 消费启动过程中可能已入队的快照，再读取消息变化。
    let snapshot = await nextSnapshot();
    if (snapshot.guards[0].phase !== "running") snapshot = await nextSnapshot();
    clients[0].notify("item/agentMessage/delta", { itemId: "reply", delta: "Live progress" });
    await settle();
    do { snapshot = await nextSnapshot(); } while (!snapshot.guards[0].logs.some(log => log.text === "Live progress"));
    assert.equal(snapshot.guards[0].id, one.id);
    await manager.remove(one.id);
    await settle();
    do { snapshot = await nextSnapshot(); } while (snapshot.guards.length > 0);
    assert.equal(snapshot.guards.length, 0);
  } finally { await reader.cancel(); }
  const reconnect = createGuardEventStream(manager, new AbortController().signal).getReader();
  try {
    const data = new TextDecoder().decode((await reconnect.read()).value);
    assert.equal(JSON.parse(data.match(/^data: (.+)$/m)[1]).guards.length, 0);
    assert.equal(clients.length, 1);
  } finally { await reconnect.cancel(); }
});
