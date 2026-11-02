import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProjectDirectory } from "../src/server/project-directory.ts";

test("project directories must be existing absolute directories; quoted paths are accepted", function (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "guard-project-directory-"));
  const file = path.join(directory, "example.txt");
  fs.writeFileSync(file, "example");
  t.after(function cleanup() {
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  });
  const resolved = fs.realpathSync(directory);
  assert.equal(resolveProjectDirectory(directory), resolved);
  assert.equal(resolveProjectDirectory(' "' + directory + '" '), resolved);
  assert.throws(function empty() { resolveProjectDirectory(""); }, /绝对路径/);
  assert.throws(function relative() { resolveProjectDirectory("relative/project"); }, /绝对路径/);
  assert.throws(function missing() { resolveProjectDirectory(path.join(directory, "missing")); }, /不存在/);
  assert.throws(function notDirectory() { resolveProjectDirectory(file); }, /文件夹/);
});
