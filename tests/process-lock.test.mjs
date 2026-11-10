import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireProcessLock } from "../scripts/process-lock.mjs";

function lockFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "page-process-lock-"));
  t.after(function cleanup() {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("page-process-lock-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return path.join(directory, "page-views.lock");
}

test("active owner blocks a second updater and release removes only its own token", function (t) {
  const file = lockFile(t);
  const release = acquireProcessLock(file);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).pid, process.pid);
  assert.throws(function duplicate() { acquireProcessLock(file); }, /已在运行/);
  release();
  const replacement = acquireProcessLock(file);
  release();
  assert.equal(fs.existsSync(file), true);
  replacement();
  assert.equal(fs.existsSync(file), false);
});

test("legacy lock with a reused Windows system PID is reclaimed without terminating any process", function (t) {
  const file = lockFile(t);
  fs.writeFileSync(file, "4084");
  const release = acquireProcessLock(file, function inspect(pid) {
    assert.equal(pid, 4084);
    return { alive: true, name: "WUDFHost.exe" };
  });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).pid, process.pid);
  release();
});

test("Windows detects PID reuse even when the replacement is also Node", { skip: process.platform !== "win32" }, function (t) {
  const file = lockFile(t);
  fs.writeFileSync(file, String(process.pid));
  fs.utimesSync(file, new Date("2000-01-01"), new Date("2000-01-01"));
  const release = acquireProcessLock(file);
  release();
  assert.equal(fs.existsSync(file), false);
});

test("dead owner is reclaimed, but failed inspection and invalid PID preserve the existing lock", function (t) {
  const file = lockFile(t);
  fs.writeFileSync(file, "12345");
  assert.throws(function uncertain() {
    acquireProcessLock(file, function inspect() { throw new Error("Inspection unavailable"); });
  }, /Inspection unavailable/);
  assert.equal(fs.readFileSync(file, "utf8"), "12345");
  const release = acquireProcessLock(file, function dead() { return { alive: false }; });
  release();
  fs.writeFileSync(file, "0");
  assert.throws(function invalid() { acquireProcessLock(file); }, /格式不正确/);
  assert.equal(fs.readFileSync(file, "utf8"), "0");
});
