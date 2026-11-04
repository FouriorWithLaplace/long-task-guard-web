import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { WebSocketServer } from "ws";
import { createHash } from "node:crypto";
import { once } from "node:events";

test("stdio client: handshake, notifications, server requests and closing pending calls", async function (t) {
  const sent = [];
  const notifications = [];
  const requests = [];
  const disconnects = [];
  let processOptions;
  let killed = false;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.stdin = new Writable({
    write(chunk, encoding, callback) {
      const message = JSON.parse(chunk.toString());
      sent.push(message);
      if (message.method === "initialize") {
        queueMicrotask(function reply() {
          child.stdout.write(JSON.stringify({ id: message.id, result: { userAgent: "test" } }) + "\n");
        });
      }
      callback();
    },
  });
  child.kill = function kill() { killed = true; return true; };
  const mock = t.mock.method(childProcess, "spawn", function (executable, args, options) {
    assert.equal(executable, "fake-codex");
    assert.deepEqual(args, ["--no-daemon", "app-server", "--listen", "stdio://"]);
    processOptions = options;
    return child;
  });
  syncBuiltinESMExports();
  const { CodexClient } = await import("../src/server/codex-client.ts");
  const client = new CodexClient("fake-codex", process.cwd(), {
    onNotification(method, params) { notifications.push({ method, params }); },
    onRequest(id, method, params) { requests.push({ id, method, params }); },
    onDisconnect(error) { disconnects.push(error); },
  });

  try {
    await client.initialize();
    assert.equal(processOptions.windowsHide, true);
    assert.equal(processOptions.cwd, process.cwd());
    assert.equal(sent[0].method, "initialize");
    assert.equal(sent[1].method, "initialized");

    // Split one JSON message across chunks, then send two complete lines together.
    child.stdout.write('{"method":"item/agentMessage/delta","params":');
    child.stdout.write('{"delta":"hello"}}\n{"id":5,"method":"item/commandExecution/requestApproval","params":{}}\n');
    assert.deepEqual(notifications, [{ method: "item/agentMessage/delta", params: { delta: "hello" } }]);
    assert.equal(requests[0].id, 5);
    client.respond(5, { decision: "decline" });
    assert.deepEqual(sent.at(-1), { id: 5, result: { decision: "decline" } });

    const failed = client.request("thread/resume", { threadId: "test" });
    child.stdout.write(JSON.stringify({ id: sent.at(-1).id, error: { message: "resume failed" } }) + "\n");
    await assert.rejects(failed, /resume failed/);

    const oversized = client.request("turn/start", { threadId: "test" });
    const errorData = { codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 413 } } };
    child.stdout.write(JSON.stringify({ id: sent.at(-1).id, error: { message: "Provider rejected request", data: errorData } }) + "\n");
    await assert.rejects(oversized, function preservesData(error) {
      assert.equal(error.message, "Provider rejected request");
      assert.deepEqual(error.data, errorData);
      return true;
    });

    t.mock.timers.enable({ apis: ["setTimeout"] });
    const recovering = client.request("turn/start", { threadId: "test" });
    const recoveringId = sent.at(-1).id;
    let recoverySettled = false;
    recovering.then(function resolved() { recoverySettled = true; }, function rejected() { recoverySettled = true; });
    child.stdout.write(JSON.stringify({ method: "error", params: { threadId: "test", turnId: "turn-1", willRetry: true } }) + "\n");
    t.mock.timers.tick(120000);
    await Promise.resolve();
    assert.equal(recoverySettled, false);
    child.stdout.write(JSON.stringify({ id: recoveringId, result: { turn: { id: "turn-1" } } }) + "\n");
    assert.deepEqual(await recovering, { turn: { id: "turn-1" } });

    const completedDuringReconnect = client.request("turn/start", { threadId: "test" });
    child.stdout.write(JSON.stringify({ method: "error", params: { threadId: "test", turnId: "turn-2", willRetry: true } }) + "\n");
    const finishedTurn = { id: "turn-2", status: "failed" };
    child.stdout.write(JSON.stringify({ method: "turn/completed", params: { threadId: "test", turn: finishedTurn } }) + "\n");
    assert.deepEqual(await completedDuringReconnect, { turn: finishedTurn });

    // A different thread's reconnect must not disable this request's timeout.
    const unrelated = client.request("turn/start", { threadId: "other" });
    const unrelatedRejected = assert.rejects(unrelated, /turn\/start/);
    child.stdout.write(JSON.stringify({ method: "error", params: { threadId: "test", willRetry: true } }) + "\n");
    t.mock.timers.tick(30000);
    await unrelatedRejected;

    const pending = client.request("turn/start", {});
    const rejected = assert.rejects(pending);
    const reconnecting = client.request("turn/start", { threadId: "test" });
    const reconnectingRejected = assert.rejects(reconnecting);
    child.stdout.write(JSON.stringify({ method: "error", params: { threadId: "test", willRetry: true } }) + "\n");
    client.close();
    await rejected;
    await reconnectingRejected;
    assert.equal(killed, true);
    assert.equal(disconnects.length, 0);
    await assert.rejects(client.request("turn/start", {}));
    client.close();
  } finally {
    client.close();
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("WebSocket transport authenticates, shares an endpoint with the renderer and preserves structured errors", async function (t) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const endpoint = "ws://127.0.0.1:" + server.address().port;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  let killed = false;
  child.kill = function kill() { killed = true; };
  let hash;
  let authorization;
  let socket;
  const mock = t.mock.method(childProcess, "spawn", function spawn(executable, args, options) {
    assert.equal(args[3], "ws://127.0.0.1:0");
    assert.equal(options.windowsHide, true);
    hash = args.at(-1);
    return child;
  });
  syncBuiltinESMExports();
  server.on("connection", function connected(connection, request) {
    socket = connection;
    authorization = request.headers.authorization;
    connection.on("message", function receive(data) {
      const message = JSON.parse(data.toString());
      if (message.method === "initialize") connection.send(JSON.stringify({ id: message.id, result: { userAgent: "test" } }));
      if (message.method === "turn/start") connection.send(JSON.stringify({ id: message.id, error: { message: "Request failed", data: { httpStatusCode: 413 } } }));
    });
  });
  const notifications = [];
  const disconnects = [];
  const { CodexClient } = await import("../src/server/codex-client.ts");
  const client = new CodexClient("fake-codex", process.cwd(), {
    onNotification(method, params) { notifications.push({ method, params }); },
    onRequest() {}, onDisconnect(error) { disconnects.push(error); },
  }, "websocket");
  try {
    assert.equal(client.terminalTarget(), null);
    const initializing = client.initialize();
    child.stderr.write("codex app-server\n  \x1b[2mlistening ");
    child.stderr.write("on:\x1b[0m \x1b[32m" + endpoint + "\x1b[0m\n");
    await initializing;
    const target = client.terminalTarget();
    assert.equal(target.endpoint, endpoint);
    assert.equal(authorization, "Bearer " + target.token);
    assert.equal(createHash("sha256").update(target.token).digest("hex"), hash);
    await assert.rejects(client.request("turn/start", { threadId: "thread" }), function structured(error) { return error.data.httpStatusCode === 413; });
    socket.send(JSON.stringify({ method: "item/started", params: { threadId: "thread" } }));
    await new Promise(function wait(resolve) { setTimeout(resolve, 20); });
    assert.equal(notifications[0].method, "item/started");
    client.close();
    assert.equal(client.terminalTarget(), null);
    assert.equal(killed, true);
    assert.equal(disconnects.length, 0);
  } finally {
    client.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise(function close(resolve) { server.close(resolve); });
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test("closing before WebSocket startup cancels initialization and ignores a late endpoint", async function (t) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = function kill() {};
  const mock = t.mock.method(childProcess, "spawn", function spawn() { return child; });
  syncBuiltinESMExports();
  const { CodexClient } = await import("../src/server/codex-client.ts");
  const client = new CodexClient("fake", process.cwd(), { onNotification() {}, onRequest() {}, onDisconnect() {} }, "websocket");
  try {
    const starting = client.initialize();
    client.close();
    child.stderr.write("listening on: ws://127.0.0.1:1\n");
    await assert.rejects(starting, /连接已关闭/);
    assert.equal(client.terminalTarget(), null);
  } finally { client.close(); mock.mock.restore(); syncBuiltinESMExports(); }
});
