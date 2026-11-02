import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveProjectDirectory } from "./project-directory";

const executeFile = promisify(execFile);
type ExecuteFile = typeof executeFile;
let selecting = false;

// 固定脚本不插入用户输入；UTF-8 输出保留中文目录名。
const folderDialogScript = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择守护任务的工程文件夹'
$dialog.ShowNewFolderButton = $false
$dialog.SelectedPath = $env:LONG_TASK_GUARD_PICKER_START_DIR
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
try {
  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($dialog.SelectedPath)
  }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
`;

export async function pickProjectDirectory(execute: ExecuteFile = executeFile, platform: string = process.platform): Promise<string | null> {
  if (platform !== "win32") throw new Error("本地文件夹选择器目前支持 Windows 服务端。");
  if (selecting) throw new Error("文件夹选择窗口已经打开，请先完成或取消当前选择。");
  selecting = true;
  let selected: string;
  try {
    const result = await execute("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(folderDialogScript, "utf16le").toString("base64")], {
      windowsHide: true, timeout: 120000, maxBuffer: 65536, encoding: "utf8",
      env: { ...process.env, LONG_TASK_GUARD_PICKER_START_DIR: process.cwd() },
    });
    selected = result.stdout.trim();
  } catch (error) {
    if (error instanceof Error && "killed" in error && error.killed) {
      throw new Error("文件夹选择已超时，请重新打开选择窗口。");
    }
    throw new Error("无法打开本地文件夹选择窗口，请确认服务运行在当前 Windows 桌面会话中。");
  } finally {
    selecting = false;
  }
  if (!selected) return null;
  return resolveProjectDirectory(selected);
}
