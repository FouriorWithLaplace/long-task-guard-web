import fs from "node:fs";
import path from "node:path";

export function resolveProjectDirectory(value: string): string {
  let directory = value.trim();
  // Windows 的“复制文件地址”可能带有双引号。
  if (directory.startsWith('"') && directory.endsWith('"')) directory = directory.slice(1, -1);
  if (!path.isAbsolute(directory)) throw new Error("请填写工程目录的绝对路径。");

  try {
    const resolved = fs.realpathSync(directory);
    if (fs.statSync(resolved).isDirectory()) return resolved;
  } catch {
    throw new Error("工程目录不存在或无法访问，请检查路径。");
  }
  throw new Error("工程路径必须是文件夹，不能是文件。");
}
