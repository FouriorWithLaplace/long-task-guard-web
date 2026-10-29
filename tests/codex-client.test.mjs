import assert from "node:assert/strict";
import test from "node:test";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

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

    const pending = client.request("turn/start", {});
    const rejected = assert.rejects(pending);
    client.close();
    await rejected;
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
