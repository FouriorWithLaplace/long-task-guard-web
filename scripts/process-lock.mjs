import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

export function inspectProcess(pid) {
  try { process.kill(pid, 0); }
  catch (error) {
    if (error.code === "ESRCH") return { alive: false };
    if (error.code !== "EPERM") throw error;
  }
  if (process.platform !== "win32") return { alive: true };
  // PID 经重启或进程退出后会复用；Windows 需要同时核对进程名称和创建时间。
  const command = "$ErrorActionPreference = 'Stop'; " +
    "$lockOwner = Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "'; " +
    "if ($null -eq $lockOwner) { '{\"alive\":false}' } else { " +
    "@{alive=$true; name=$lockOwner.Name; startedAt=$lockOwner.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress }";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8", windowsHide: true, timeout: 10000,
  });
  if (result.error || result.status !== 0) throw new Error("无法核对页面更新器进程，请稍后重试。", { cause: result.error });
  const state = JSON.parse(result.stdout.trim());
  if (state.alive) {
    state.startedAt = Date.parse(state.startedAt);
    if (!Number.isFinite(state.startedAt)) throw new Error("无法读取页面更新器的启动时间。");
  }
  return state;
}

export function acquireProcessLock(file, inspect = inspectProcess) {
  const contents = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, contents, { flag: "wx" });
      return function release() {
        try {
          // 即使 PID 被复用，也只能删除本次启动创建的锁。
          if (fs.readFileSync(file, "utf8") === contents) fs.unlinkSync(file);
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      };
    } catch (error) { if (error.code !== "EEXIST") throw error; }
    let previous;
    let modifiedAt;
    try {
      previous = fs.readFileSync(file, "utf8");
      modifiedAt = fs.statSync(file).mtimeMs;
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    // 兼容旧版只保存 PID 的锁文件。
    const record = JSON.parse(previous);
    const pid = typeof record === "number" ? record : record?.pid;
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("页面更新器锁文件格式不正确：" + file);
    const owner = inspect(pid);
    const differentProgram = owner.name && owner.name.toLowerCase() !== path.basename(process.execPath).toLowerCase();
    const reusedPid = Number.isFinite(owner.startedAt) && owner.startedAt > modifiedAt;
    if (owner.alive && !differentProgram && !reusedPid)
      throw new Error("页面更新器已在运行（PID " + pid + "）。请先停止该网站实例，再启动或重建页面数据。");
    // 进程检查期间另一个启动可能已接管；重新读取后再清理旧锁。
    try {
      if (fs.readFileSync(file, "utf8") === previous && fs.statSync(file).mtimeMs === modifiedAt)
        fs.unlinkSync(file);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  throw new Error("页面更新器锁正在变化，请稍后重试。");
}
