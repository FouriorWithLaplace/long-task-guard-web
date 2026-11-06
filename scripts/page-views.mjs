import fs from "node:fs";
import path from "node:path";
import { paths, panelDirectory } from "../src/server/encyclopedia/config.ts";
import { ViewBuilder } from "../src/server/encyclopedia/view-builder.ts";

const directory = panelDirectory(paths);
fs.mkdirSync(directory, { recursive: true });
const lockFile = path.join(directory, "page-views.lock");
function takeLock() {
  try { fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = Number(fs.readFileSync(lockFile, "utf8"));
    let alive = true;
    try { process.kill(owner, 0); } catch (failure) { if (failure.code === "ESRCH") alive = false; }
    if (alive) throw new Error("页面更新器已在运行（PID " + owner + "）。请先停止网站，再重建页面数据。");
    fs.unlinkSync(lockFile);
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
  }
}
takeLock();
let builder;
let timer;
let interval;
const watchers = [];
function close() {
  clearTimeout(timer);
  clearInterval(interval);
  for (const watcher of watchers) watcher.close();
  builder?.close();
  builder = null;
  if (fs.existsSync(lockFile) && fs.readFileSync(lockFile, "utf8") === String(process.pid)) fs.unlinkSync(lockFile);
}
function shutdown() { close(); process.exit(0); }
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("disconnect", shutdown);
process.on("message", function message(value) { if (value?.shutdown) shutdown(); });
process.once("exit", close);
try {
  console.time("页面摘要准备");
  builder = new ViewBuilder(paths);
  const result = builder.sync(process.argv.includes("--rebuild"));
  console.timeEnd("页面摘要准备");
  console.log("页面摘要已就绪：", result);
  process.send?.({ ready: true });
  if (process.argv.includes("--once")) shutdown();
  function update() {
    timer = undefined;
    try { builder.sync(); }
    catch (error) { console.error("页面摘要更新失败，将保留变更记录并重试：", error); }
  }
  function schedule() {
    if (!timer) timer = setTimeout(update, 250);
  }
  for (const file of [paths.database, path.join(directory, "state.sqlite")]) {
    const basename = path.basename(file);
    watchers.push(fs.watch(path.dirname(file), function changed(event, filename) {
      if (!filename || [basename, basename + "-wal", basename + "-journal"].includes(String(filename))) schedule();
    }));
  }
  // Cheap journal checks recover missed filesystem notifications; no view recalculation when idle.
  interval = setInterval(schedule, 5000);
} catch (error) {
  console.error(error);
  close();
  process.exitCode = 1;
}
