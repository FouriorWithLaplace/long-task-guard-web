import assert from "node:assert/strict";
import test from "node:test";
import { createGuardEventStream } from "../src/server/guard-events.ts";

function fixture() {
  const listeners = new Set();
  let snapshot = { instanceId: "test", revision: 0, phase: "paused", logs: [] };
  const source = {
    snapshot() { return structuredClone(snapshot); },
    subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() { listeners.delete(listener); };
    },
  };
  return {
    source, listeners,
    emit(revision) {
      snapshot = { ...snapshot, revision, logs: [{ id: 1, text: "Output " + revision }] };
      for (const listener of listeners) listener(source.snapshot());
    },
  };
}

function decode(value) {
  const frame = new TextDecoder().decode(value);
  const match = frame.match(/^data: (.+)$/m);
  return { frame, snapshot: match ? JSON.parse(match[1]) : null };
}

test("SSE immediately sends initial state, then pushes changes on the same connection", async function () {
  const { source, listeners, emit } = fixture();
  const controller = new AbortController();
  const reader = createGuardEventStream(source, controller.signal).getReader();
  try {
    const initial = decode((await reader.read()).value);
    assert.ok(initial.frame.includes("retry: 2000"));
    assert.ok(initial.frame.includes("event: snapshot"));
    assert.equal(initial.snapshot.revision, 0);
    assert.equal(listeners.size, 1);
    emit(1);
    const update = decode((await reader.read()).value);
    assert.equal(update.snapshot.revision, 1);
    assert.equal(update.snapshot.logs[0].text, "Output 1");
  } finally { await reader.cancel(); }
  assert.equal(listeners.size, 0);
});

test("slow readers receive the latest snapshot without unbounded buffering", async function () {
  const { source, listeners, emit } = fixture();
  const reader = createGuardEventStream(source, new AbortController().signal).getReader();
  try {
    for (let revision = 1; revision <= 100; revision++) emit(revision);
    assert.equal(decode((await reader.read()).value).snapshot.revision, 0);
    assert.equal(decode((await reader.read()).value).snapshot.revision, 100);
  } finally { await reader.cancel(); }
  assert.equal(listeners.size, 0);
});

test("abort removes subscription and reconnect receives current state without starting work", async function () {
  const { source, listeners, emit } = fixture();
  const controller = new AbortController();
  const reader = createGuardEventStream(source, controller.signal).getReader();
  await reader.read();
  controller.abort();
  assert.equal(listeners.size, 0);
  assert.equal((await reader.read()).done, true);
  emit(8);
  const reconnected = createGuardEventStream(source, new AbortController().signal).getReader();
  try {
    assert.equal(decode((await reconnected.read()).value).snapshot.revision, 8);
  } finally { await reconnected.cancel(); }
});

test("heartbeat is only a comment on the existing stream; cancellation removes timer", async function (t) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { source, listeners } = fixture();
  const reader = createGuardEventStream(source, new AbortController().signal).getReader();
  await reader.read();
  const pending = reader.read();
  t.mock.timers.tick(25000);
  const heartbeat = decode((await pending).value);
  assert.equal(heartbeat.frame, ": keep-alive\n\n");
  assert.equal(heartbeat.snapshot, null);
  await reader.cancel();
  assert.equal(listeners.size, 0);
  t.mock.timers.tick(100000);
});

test("already-aborted requests do not subscribe or leave an open stream", async function () {
  const { source, listeners } = fixture();
  const controller = new AbortController();
  controller.abort();
  const reader = createGuardEventStream(source, controller.signal).getReader();
  assert.equal((await reader.read()).done, true);
  assert.equal(listeners.size, 0);
});
