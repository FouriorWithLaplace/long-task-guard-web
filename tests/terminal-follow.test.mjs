import assert from "node:assert/strict";
import test from "node:test";
import { followTerminalOutput } from "../src/components/terminal-follow.ts";

function fixture() {
  const element = new EventTarget();
  const events = new EventTarget();
  events.setTimeout = function schedule(callback, delay) { return setTimeout(callback, delay); };
  events.clearTimeout = function cancel(timer) { clearTimeout(timer); };
  const buffer = { viewportY: 100, baseY: 100 };
  let onScroll = function noListener() {};
  const terminal = {
    buffer: { active: buffer },
    onScroll(listener) { onScroll = listener; return { dispose() { onScroll = function noListener() {}; } }; },
    scrollToBottom() { terminal.scrollToLine(buffer.baseY); },
    scrollToLine(line) { buffer.viewportY = Math.min(line, buffer.baseY); onScroll(buffer.viewportY); },
  };
  const follow = followTerminalOutput(terminal, element, events);
  function dispatch(target, type, fields = {}) { target.dispatchEvent(Object.assign(new Event(type), fields)); }
  async function scrollUp(line = 30) {
    dispatch(element, "wheel");
    terminal.scrollToLine(line);
    await Promise.resolve();
  }
  function output(reset = false) {
    follow.beforeWrite();
    buffer.baseY += 10;
    // 模拟输出自动滚动，或完整终端快照重建时触发的 onScroll。
    terminal.scrollToLine(reset ? 0 : buffer.baseY);
    follow.afterWrite();
  }
  return { element, events, buffer, terminal, follow, dispatch, scrollUp, output };
}

test("new output follows the bottom, manual scrolling pauses, and snapshots preserve the reading position", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.output();
    assert.equal(f.buffer.viewportY, f.buffer.baseY);
    await f.scrollUp();
    f.output();
    f.output(true);
    assert.equal(f.buffer.viewportY, 30);
    t.mock.timers.tick(4000);
    f.output();
    assert.equal(f.buffer.viewportY, 30);
    t.mock.timers.tick(1000);
    assert.equal(f.buffer.viewportY, f.buffer.baseY, "output must not postpone the five-second resume timer");
  } finally { f.follow.dispose(); }
});

test("scrolling during an outstanding write wins over the old reading position", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    await f.scrollUp(30);
    f.follow.beforeWrite();
    await f.scrollUp(15);
    f.buffer.baseY += 20;
    f.terminal.scrollToBottom();
    f.follow.afterWrite();
    assert.equal(f.buffer.viewportY, 15);
    f.follow.resume();
    f.output();
    assert.equal(f.buffer.viewportY, f.buffer.baseY);
    await f.scrollUp(20);
    f.terminal.scrollToBottom();
    f.output();
    assert.equal(f.buffer.viewportY, f.buffer.baseY, "manually reaching the bottom resumes following");
  } finally { f.follow.dispose(); }
});

test("a wheel event pauses immediately even when xterm waits until the next frame to scroll", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    f.dispatch(f.element, "wheel");
    await Promise.resolve();
    f.output();
    assert.equal(f.buffer.viewportY, 100, "the unchanged bottom position must not prematurely resume following");
    f.terminal.scrollToLine(25);
    f.output();
    assert.equal(f.buffer.viewportY, 25);
  } finally { f.follow.dispose(); }
});

test("mouse and touch holds suppress automatic following until released", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  try {
    await f.scrollUp();
    f.dispatch(f.element, "mousedown", { button: 0 });
    t.mock.timers.tick(10000);
    f.output();
    assert.equal(f.buffer.viewportY, 30);
    f.dispatch(f.events, "mouseup", { button: 0 });
    t.mock.timers.tick(5000);
    assert.equal(f.buffer.viewportY, f.buffer.baseY);
    await f.scrollUp(40);
    f.dispatch(f.element, "touchstart");
    t.mock.timers.tick(10000);
    f.output(true);
    assert.equal(f.buffer.viewportY, 40);
    f.dispatch(f.element, "touchend", { targetTouches: [] });
    t.mock.timers.tick(5000);
    assert.equal(f.buffer.viewportY, f.buffer.baseY);
  } finally { f.follow.dispose(); }
});

test("disposing cancels resume timers and ignores late write callbacks", async function (t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  await f.scrollUp(20);
  f.follow.beforeWrite();
  f.follow.dispose();
  t.mock.timers.tick(10000);
  f.follow.afterWrite();
  f.follow.resume();
  f.dispatch(f.events, "blur");
  assert.equal(f.buffer.viewportY, 20);
});
