import type { Terminal } from "@xterm/xterm";

// xterm 自己管理滚动缓冲，不能用外层 div 的 scrollHeight 判断是否位于底部。
export function followTerminalOutput(terminal: Terminal, element: HTMLElement, events: Window = window) {
  let following = true;
  let disposed = false;
  let mouseHeld = false;
  let touchHeld = false;
  let pendingWrites = 0;
  let restoringViewport = false;
  let viewportLine = terminal.buffer.active.viewportY;
  let resumeTimer: number | undefined;

  function clearTimer() {
    events.clearTimeout(resumeTimer);
    resumeTimer = undefined;
  }

  function resume() {
    if (disposed) return;
    clearTimer();
    following = true;
    terminal.scrollToBottom();
  }

  function pause() {
    following = false;
    viewportLine = terminal.buffer.active.viewportY;
    clearTimer();
    if (!mouseHeld && !touchHeld) resumeTimer = events.setTimeout(resume, 5000);
  }

  function readUserPosition() {
    if (disposed || following) return;
    viewportLine = terminal.buffer.active.viewportY;
    if (!mouseHeld && !touchHeld && viewportLine >= terminal.buffer.active.baseY) resume();
  }

  function handleScroll() {
    // 输出解析和快照重建也会触发 onScroll，不能误判成用户主动回到底部。
    if (pendingWrites > 0 || restoringViewport) return;
    readUserPosition();
  }

  function handleWheel() {
    pause();
    // xterm 可能到下一帧才滚动。这里仅记录位置，回到底部由 onScroll 判断，
    // 否则滚轮刚触发、视口还没离开底部时，就会错误地恢复自动跟随。
    queueMicrotask(function rememberUserPosition() {
      if (!disposed && !following) viewportLine = terminal.buffer.active.viewportY;
    });
  }

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    mouseHeld = true;
    pause();
  }

  function handleMouseMove() {
    if (mouseHeld) queueMicrotask(readUserPosition);
  }

  function handleMouseUp(event: MouseEvent) {
    if (event.button !== 0 || !mouseHeld) return;
    mouseHeld = false;
    pause();
    readUserPosition();
  }

  function handleTouchStart() {
    touchHeld = true;
    pause();
  }

  function handleTouchMove() { queueMicrotask(readUserPosition); }

  function handleTouchEnd(event: TouchEvent) {
    touchHeld = event.targetTouches.length > 0;
    pause();
    readUserPosition();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) handleWheel();
  }

  function handleBlur() {
    if (!mouseHeld && !touchHeld) return;
    mouseHeld = false;
    touchHeld = false;
    pause();
  }

  function beforeWrite() {
    if (disposed) return;
    if (pendingWrites === 0 && !following) viewportLine = terminal.buffer.active.viewportY;
    pendingWrites++;
  }

  function afterWrite() {
    if (disposed) return;
    pendingWrites--;
    restoringViewport = true;
    if (following) terminal.scrollToBottom();
    else terminal.scrollToLine(viewportLine);
    restoringViewport = false;
  }

  const scrollSubscription = terminal.onScroll(handleScroll);
  element.addEventListener("wheel", handleWheel, { passive: true, capture: true });
  element.addEventListener("mousedown", handleMouseDown, true);
  element.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
  element.addEventListener("touchmove", handleTouchMove, { passive: true });
  element.addEventListener("touchend", handleTouchEnd, { passive: true });
  element.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  element.addEventListener("keydown", handleKeyDown, true);
  events.addEventListener("mousemove", handleMouseMove);
  events.addEventListener("mouseup", handleMouseUp);
  events.addEventListener("blur", handleBlur);
  resume();

  function dispose() {
    disposed = true;
    clearTimer();
    scrollSubscription.dispose();
    element.removeEventListener("wheel", handleWheel, true);
    element.removeEventListener("mousedown", handleMouseDown, true);
    element.removeEventListener("touchstart", handleTouchStart, true);
    element.removeEventListener("touchmove", handleTouchMove);
    element.removeEventListener("touchend", handleTouchEnd);
    element.removeEventListener("touchcancel", handleTouchEnd);
    element.removeEventListener("keydown", handleKeyDown, true);
    events.removeEventListener("mousemove", handleMouseMove);
    events.removeEventListener("mouseup", handleMouseUp);
    events.removeEventListener("blur", handleBlur);
  }

  return { beforeWrite, afterWrite, resume, dispose };
}
