import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./project-directory") return nextResolve(new URL("./project-directory.ts", context.parentURL).href, context);
    return nextResolve(specifier, context);
  },
});
const { pickProjectDirectory } = await import("../src/server/project-picker.ts");
hooks.deregister();

test("native picker returns verified Unicode directories, cancellation does not choose a directory", async function (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guard-选择目录-"));
  t.after(function cleanup() { fs.rmdirSync(directory); });
  const selected = await pickProjectDirectory(async function execute(file, args, options) {
    assert.equal(file, "powershell.exe");
    assert.ok(args.includes("-STA"));
    assert.equal(options.windowsHide, true);
    assert.equal(options.encoding, "utf8");
    const script = Buffer.from(args.at(-1), "base64").toString("utf16le");
    assert.ok(script.includes("FolderBrowserDialog"));
    return { stdout: directory, stderr: "" };
  }, "win32");
  assert.equal(selected, fs.realpathSync(directory));
  assert.equal(await pickProjectDirectory(async function cancel() { return { stdout: "", stderr: "" }; }, "win32"), null);
  await assert.rejects(pickProjectDirectory(async function invalid() { return { stdout: path.join(directory, "missing"), stderr: "" }; }, "win32"), /不存在/);
});

test("picker prevents overlapping dialogs and unlocks after failure", async function () {
  let release;
  const result = new Promise(function wait(resolve) { release = resolve; });
  const first = pickProjectDirectory(async function wait() { return result; }, "win32");
  await assert.rejects(pickProjectDirectory(async function unused() {}, "win32"), /已经打开/);
  release({ stdout: "", stderr: "" });
  await first;
  await assert.rejects(pickProjectDirectory(async function timeout() { throw Object.assign(new Error("timeout"), { killed: true }); }, "win32"), /超时/);
  assert.equal(await pickProjectDirectory(async function cancel() { return { stdout: "", stderr: "" }; }, "win32"), null);
});
