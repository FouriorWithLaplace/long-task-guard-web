import { CodexTerminal, terminalSize } from "./codex-terminal";
import { GuardError } from "./guard-manager";
import type { GuardManager } from "./guard-manager";
import type { TerminalTarget } from "./codex-terminal";

type CreateTerminal = (target: TerminalTarget, cols: number, rows: number) => CodexTerminal;

export class GuardTerminalService {
  private manager: GuardManager;
  private terminals = new Map<string, { guardId: string; terminal: CodexTerminal }>();
  private createTerminal: CreateTerminal;
  private unsubscribe: () => void;

  constructor(manager: GuardManager, createTerminal: CreateTerminal = createNativeTerminal) {
    this.manager = manager;
    this.createTerminal = createTerminal;
    this.unsubscribe = manager.subscribe(this.refresh.bind(this));
  }

  create(guardId: string, cols: unknown, rows: unknown) {
    this.refresh();
    const target = this.manager.terminalTarget(guardId);
    if (!target) throw new GuardError("终端尚未就绪。已暂停的任务请点击开始；更新前正在执行的任务需要暂停并重新开始一次。", 409);
    let count = 0;
    for (const entry of this.terminals.values()) if (entry.guardId === guardId) count++;
    if (count >= 4 || this.terminals.size >= 16) throw new GuardError("打开的终端页面过多，请先关闭其他终端页面。", 429);
    const size = terminalSize(cols, rows);
    const terminal = this.createTerminal(target, size.cols, size.rows);
    this.terminals.set(terminal.id, { guardId, terminal });
    return { viewerId: terminal.id, sessionId: target.sessionId };
  }

  stream(guardId: string, viewerId: string, signal: AbortSignal) {
    const terminals = this.terminals;
    return this.find(guardId, viewerId).stream(signal, function remove() { terminals.delete(viewerId); });
  }

  resize(guardId: string, viewerId: string, cols: unknown, rows: unknown) {
    const size = terminalSize(cols, rows);
    this.find(guardId, viewerId).resize(size.cols, size.rows);
  }

  remove(guardId: string, viewerId: string) {
    const entry = this.terminals.get(viewerId);
    if (!entry || entry.guardId !== guardId) return;
    entry.terminal.close();
    this.terminals.delete(viewerId);
  }

  dispose() {
    this.unsubscribe();
    for (const entry of this.terminals.values()) entry.terminal.close();
    this.terminals.clear();
  }

  private find(guardId: string, viewerId: string) {
    this.refresh();
    const entry = this.terminals.get(viewerId);
    if (!entry || entry.guardId !== guardId) throw new GuardError("终端显示已关闭，请重新连接。", 404);
    return entry.terminal;
  }

  private refresh() {
    for (const [id, entry] of this.terminals) {
      let target: TerminalTarget | null = null;
      try { target = this.manager.terminalTarget(entry.guardId); } catch { /* 守护已被删除。 */ }
      const previous = entry.terminal.target;
      if (entry.terminal.isClosed() || !target || previous.endpoint !== target.endpoint || previous.sessionId !== target.sessionId) {
        entry.terminal.close("守护连接已变化，终端将跟随当前会话。 ");
        this.terminals.delete(id);
      }
    }
  }
}

function createNativeTerminal(target: TerminalTarget, cols: number, rows: number) {
  return new CodexTerminal(target, cols, rows);
}
