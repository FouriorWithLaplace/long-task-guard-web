import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import headless from "@xterm/headless";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && context.parentURL?.includes("/src/server/") && !specifier.endsWith(".ts")) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { CodexTerminal, terminalSize } = await import("../src/server/codex-terminal.ts");
const { GuardTerminalService } = await import("../src/server/guard-terminal-service.ts");
const { terminalRequest } = await import("../src/server/guard-terminal-http.ts");
hooks.deregister();

const target = { executable: "codex", cwd: process.cwd(), endpoint: "ws://127.0.0.1:12345", token: "secret", sessionId: "thread-1" };

function fixture() {
  let onData;
  let onExit;
  const calls = [];
  const process = {
    onData(callback) { onData = callback; return { dispose() {} }; },
    onExit(callback) { onExit = callback; return { dispose() {} }; },
    write(data) { calls.push({ type: "write", data }); },
    resize(cols, rows) { calls.push({ type: "resize", cols, rows }); },
    kill() { calls.push({ type: "kill" }); },
  };
  const terminal = new CodexTerminal(target, 80, 24, function spawn(executable, args, options) {
    calls.push({ type: "spawn", executable, args, options });
    return process;
  });
  return { terminal, calls, data(data) { onData(data); }, exit(code) { onExit({ exitCode: code }); } };
}

async function settle() { await new Promise(function wait(resolve) { setTimeout(resolve, 40); }); }
function frame(result) {
  const text = new TextDecoder().decode(result.value);
  const lines = text.trim().split("\n");
  return { type: lines[0].slice(7), data: JSON.parse(lines[1].slice(6)) };
}

test("native terminal attaches without a prompt, preserves ANSI and Chinese, and answers terminal queries", async function () {
  const f = fixture();
  const abort = new AbortController();
  let removed = 0;
  const stream = f.terminal.stream(abort.signal, function closed() { removed++; });
  const reader = stream.getReader();
  try {
    const spawn = f.calls[0];
    assert.deepEqual(spawn.args, ["--remote", target.endpoint, "--remote-auth-token-env", "LONG_TASK_GUARD_TERMINAL_TOKEN", "--no-alt-screen", "resume", target.sessionId]);
    assert.equal(spawn.options.env.LONG_TASK_GUARD_TERMINAL_TOKEN, target.token);
    assert.equal(spawn.args.includes(target.token), false);
    assert.equal(frame(await reader.read()).type, "screen");
    f.data("\x1b[32m正在读取文件\x1b[0m\r\n具体命令及输出\r\n");
    await settle();
    const received = frame(await reader.read());
    assert.equal(received.type, "data");
    assert.match(received.data.data, /具体命令及输出/);
    assert.match(received.data.data, /\x1b\[32m/);
    assert.match(f.terminal.snapshot().data, /具体命令及输出/);
    f.data("\x1b[6n");
    await settle();
    assert.ok(f.calls.some(function cursorReply(call) { return call.type === "write" && /\x1b\[\d+;\d+R/.test(call.data); }));
    abort.abort();
    assert.equal(removed, 1);
    assert.equal(f.calls.filter(function killed(call) { return call.type === "kill"; }).length, 1);
    assert.equal(f.terminal.isClosed(), true);
  } finally { await reader.cancel(); f.terminal.close(); }
});

test("slow readers recover a complete terminal screen instead of dropping escape sequences", async function () {
  const f = fixture();
  const reader = f.terminal.stream(new AbortController().signal, function closed() {}).getReader();
  const restored = new headless.Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  try {
    await reader.read();
    f.data("x".repeat(70000) + "\r\nold text\r\n\x1b[31mfirst");
    await settle();
    f.data("\x1b[0m\r\nsecond line\r\n");
    await settle();
    await reader.read();
    const snapshot = frame(await reader.read());
    assert.equal(snapshot.type, "screen");
    await new Promise(function write(resolve) { restored.write(snapshot.data.data, resolve); });
    const lines = [];
    for (let i = 0; i < restored.buffer.active.length; i++) lines.push(restored.buffer.active.getLine(i).translateToString(true));
    assert.match(lines.join("\n"), /old text\nfirst\nsecond line/);
  } finally { restored.dispose(); await reader.cancel(); }
});

test("terminal resize, unclaimed timeout and already-aborted streams clean up owned renderers", async function (t) {
  const f = fixture();
  f.terminal.resize(100, 32);
  assert.equal(f.terminal.snapshot().cols, 100);
  assert.deepEqual(f.calls.at(-1), { type: "resize", cols: 100, rows: 32 });
  const abort = new AbortController();
  abort.abort();
  const reader = f.terminal.stream(abort.signal, function closed() {}).getReader();
  assert.equal((await reader.read()).done, true);
  assert.equal(f.terminal.isClosed(), true);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const abandoned = fixture();
  t.mock.timers.tick(15000);
  assert.equal(abandoned.terminal.isClosed(), true);
  assert.deepEqual(terminalSize(9999, 1), { cols: 240, rows: 10 });
  assert.throws(function badSize() { terminalSize("80", 24); });
});

test("exiting renderers deliver the last output and never kill an already exited process", async function () {
  const f = fixture();
  const reader = f.terminal.stream(new AbortController().signal, function closed() {}).getReader();
  await reader.read();
  const next = reader.read();
  f.data("last error\r\n");
  f.exit(1);
  const output = frame(await next);
  assert.match(output.data.data, /last error/);
  assert.equal(frame(await reader.read()).type, "end");
  assert.equal((await reader.read()).done, true);
  assert.equal(f.calls.some(function killed(call) { return call.type === "kill"; }), false);
});

function serviceFixture() {
  let changed;
  const targets = new Map([["guard-1", target], ["guard-2", { ...target, sessionId: "thread-2" }]]);
  const fixtures = [];
  const manager = {
    subscribe(listener) { changed = listener; return function unsubscribe() {}; },
    terminalTarget(id) { return targets.get(id) ?? null; },
  };
  const service = new GuardTerminalService(manager, function create(target) {
    const f = fixture();
    f.terminal.target = target;
    fixtures.push(f);
    return f.terminal;
  });
  return { service, targets, fixtures, changed() { changed(); } };
}

test("413 session switches, same-session reconnects, pause and deletion close only affected viewers", function () {
  const f = serviceFixture();
  try {
    f.service.create("guard-1", 80, 24);
    const other = f.service.create("guard-2", 80, 24);
    f.targets.set("guard-1", { ...target, sessionId: "replacement" });
    f.changed();
    assert.equal(f.fixtures[0].terminal.isClosed(), true);
    assert.equal(f.fixtures[1].terminal.isClosed(), false);
    f.service.create("guard-1", 80, 24);
    f.targets.set("guard-1", { ...target, sessionId: "replacement", endpoint: "ws://127.0.0.1:54321" });
    f.changed();
    assert.equal(f.fixtures[2].terminal.isClosed(), true);
    f.service.create("guard-1", 80, 24);
    f.targets.delete("guard-1");
    f.changed();
    assert.equal(f.fixtures[3].terminal.isClosed(), true);
    f.service.remove("guard-1", other.viewerId);
    assert.equal(f.fixtures[1].terminal.isClosed(), false);
    f.service.remove("guard-2", other.viewerId);
    assert.equal(f.fixtures[1].terminal.isClosed(), true);
  } finally { f.service.dispose(); }
});

test("terminal HTTP rejects cross-origin access, arbitrary input and other guards' viewer ids", async function () {
  const f = serviceFixture();
  const base = "http://localhost:3000/api/guards/guard-1/terminal";
  function request(method, body, origin = "http://localhost:3000") {
    return new Request(base, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  }
  try {
    assert.equal((await terminalRequest(request("POST", { action: "open", cols: 80, rows: 24 }, "https://foreign.example"), "guard-1", f.service)).status, 403);
    assert.equal((await terminalRequest(request("GET", null, "https://foreign.example"), "guard-1", f.service)).status, 403);
    assert.equal(f.fixtures.length, 0);
    const response = await terminalRequest(request("POST", { action: "open", cols: 80, rows: 24 }), "guard-1", f.service);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(target.token), false);
    assert.equal((await terminalRequest(request("POST", { action: "input", viewerId: body.viewerId, data: "do something\r" }), "guard-1", f.service)).status, 400);
    assert.equal((await terminalRequest(request("POST", { action: "resize", viewerId: body.viewerId, cols: 90, rows: 30 }), "guard-2", f.service)).status, 404);
    assert.equal((await terminalRequest(request("POST", { action: "resize", viewerId: body.viewerId, cols: 90, rows: 30 }), "guard-1", f.service)).status, 204);
    assert.equal((await terminalRequest(request("DELETE", { viewerId: body.viewerId }), "guard-1", f.service)).status, 204);
  } finally { f.service.dispose(); }
});
