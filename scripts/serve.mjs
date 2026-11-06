import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = new Set();
const environment = { ...process.env, ENCYCLOPEDIA_BACKEND_TOKEN: randomBytes(32).toString("hex") };
let stopping = false;
function launch(args, ipc = false) {
  const child = spawn(process.execPath, args, {
    cwd: root, windowsHide: true, env: environment,
    stdio: ipc ? ["ignore", "inherit", "inherit", "ipc"] : "inherit",
  });
  children.add(child);
  child.on("exit", function exited(code) {
    children.delete(child);
    if (!stopping) shutdown(code ?? 1);
  });
  child.on("error", function failed(error) { console.error(error); shutdown(1); });
  return child;
}
function terminate(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
  } else child.kill("SIGKILL");
}
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.connected) child.send({ shutdown: true });
    else child.kill("SIGTERM");
  }
  const timeout = setTimeout(function forceExit() {
    for (const child of children) terminate(child);
    process.exit(code);
  }, 3000);
  timeout.unref();
  process.exitCode = code;
}
process.once("SIGINT", function interrupted() { shutdown(); });
process.once("SIGTERM", function terminated() { shutdown(); });
process.once("exit", function cleanup() { for (const child of children) terminate(child); });

const worker = launch(["scripts/page-views.mjs"], true);
worker.once("message", function ready(message) {
  if (!message.ready || stopping) return;
  const backend = launch(["scripts/task-service.mjs"], true);
  backend.once("message", function backendReady(message) {
    if (!message.ready || stopping) return;
    environment.ENCYCLOPEDIA_BACKEND_URL = message.endpoint;
    launch(["node_modules/next/dist/bin/next", process.argv[2] || "start", ...process.argv.slice(3)], true);
  });
});
