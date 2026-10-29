"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent, MouseEvent } from "react";
import type { SessionSummary } from "@/types/guard";

interface SessionPickerProps {
  sessions: SessionSummary[];
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (sessionId: string) => void;
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

interface SessionTooltip {
  session: SessionSummary;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export default function SessionPicker(props: SessionPickerProps) {
  const listboxId = useId();
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tooltip, setTooltip] = useState<SessionTooltip | null>(null);

  let selectedSession: SessionSummary | undefined;

  for (const session of props.sessions) {
    if (session.id === props.value) {
      selectedSession = session;
      break;
    }
  }

  function cancelTooltipTimer() {
    if (tooltipTimer.current !== null) {
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
  }

  function hideTooltip() {
    cancelTooltipTimer();
    setTooltip(null);
  }

  function scheduleTooltip(session: SessionSummary, element: HTMLElement) {
    cancelTooltipTimer();
    setTooltip(null);
    const rectangle = element.getBoundingClientRect();

    function showTooltip() {
      const width = Math.min(560, window.innerWidth - 32);
      const left = Math.max(16, Math.min(rectangle.left, window.innerWidth - width - 16));
      const maxHeight = Math.min(320, window.innerHeight - 32);
      let top = rectangle.bottom + 8;

      if (top + maxHeight > window.innerHeight - 16) {
        top = Math.max(16, rectangle.top - maxHeight - 8);
      }

      setTooltip({ session: session, left: left, top: top, width: width, maxHeight: maxHeight });
      tooltipTimer.current = null;
    }

    tooltipTimer.current = setTimeout(showTooltip, 650);
  }

  function scheduleTooltipClose() {
    cancelTooltipTimer();

    function closeTooltip() {
      setTooltip(null);
      tooltipTimer.current = null;
    }

    tooltipTimer.current = setTimeout(closeTooltip, 150);
  }

  function closeMenu() {
    hideTooltip();
    setMenuPosition(null);
  }

  function openMenu(index: number) {
    const trigger = triggerRef.current;

    if (props.disabled || !trigger || props.sessions.length === 0) {
      return;
    }

    hideTooltip();
    const rectangle = trigger.getBoundingClientRect();
    const width = Math.min(rectangle.width, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rectangle.left, window.innerWidth - width - 16));
    const spaceBelow = window.innerHeight - rectangle.bottom - 16;
    const spaceAbove = rectangle.top - 16;
    let maxHeight = Math.min(320, spaceBelow);
    let top = rectangle.bottom + 6;

    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(320, spaceAbove - 6);
      top = rectangle.top - maxHeight - 6;
    }

    setActiveIndex(index);
    setMenuPosition({ left: left, top: top, width: width, maxHeight: Math.max(48, maxHeight) });
  }

  function chooseSession(session: SessionSummary) {
    props.onChange(session.id);
    closeMenu();
    triggerRef.current?.focus();
  }

  function handleTriggerClick() {
    if (menuPosition !== null) {
      closeMenu();
      return;
    }

    let index = 0;

    for (let current = 0; current < props.sessions.length; current++) {
      if (props.sessions[current].id === props.value) {
        index = current;
        break;
      }
    }

    openMenu(index);
  }

  function handleTriggerMouseEnter(event: MouseEvent<HTMLButtonElement>) {
    if (selectedSession && menuPosition === null) {
      scheduleTooltip(selectedSession, event.currentTarget);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      hideTooltip();

      if (menuPosition === null) {
        handleTriggerClick();
        return;
      }

      let nextIndex = activeIndex + 1;

      if (event.key === "ArrowUp") {
        nextIndex = activeIndex - 1;
      }

      nextIndex = Math.max(0, Math.min(nextIndex, props.sessions.length - 1));
      setActiveIndex(nextIndex);
      return;
    }

    if (menuPosition !== null && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      hideTooltip();

      if (event.key === "Home") {
        setActiveIndex(0);
      } else {
        setActiveIndex(props.sessions.length - 1);
      }

      return;
    }

    if (menuPosition !== null && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const session = props.sessions[activeIndex];

      if (session) {
        chooseSession(session);
      }
    }
  }

  useEffect(function listenForDismiss() {
    if (menuPosition === null && tooltip === null) {
      return;
    }

    function dismiss() {
      if (tooltipTimer.current !== null) {
        clearTimeout(tooltipTimer.current);
        tooltipTimer.current = null;
      }

      setMenuPosition(null);
      setTooltip(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }

      dismiss();
    }

    function handleScroll(event: Event) {
      const target = event.target;

      if (target instanceof Node && tooltipRef.current?.contains(target)) {
        return;
      }

      if (target instanceof Node && menuRef.current?.contains(target)) {
        if (tooltipTimer.current !== null) {
          clearTimeout(tooltipTimer.current);
          tooltipTimer.current = null;
        }

        setTooltip(null);
        return;
      }

      dismiss();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", handleScroll, true);

    return function removeListeners() {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [menuPosition, tooltip]);

  useEffect(function keepActiveOptionVisible() {
    if (menuPosition !== null) {
      const option = document.getElementById(listboxId + "-" + activeIndex);
      option?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, menuPosition, listboxId]);

  useEffect(function cleanUpOnUnmount() {
    return function cancelPendingTooltip() {
      if (tooltipTimer.current !== null) {
        clearTimeout(tooltipTimer.current);
      }
    };
  }, []);

  function renderOption(session: SessionSummary, index: number) {
    let optionClass = "flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-800";

    if (index === activeIndex) {
      optionClass += " bg-blue-50";
    } else {
      optionClass += " bg-white hover:bg-slate-50";
    }

    function handleChoose() {
      chooseSession(session);
    }

    function handleMouseEnter(event: MouseEvent<HTMLButtonElement>) {
      setActiveIndex(index);
      scheduleTooltip(session, event.currentTarget);
    }

    return (
      <button
        key={session.id}
        id={listboxId + "-" + index}
        type="button"
        role="option"
        aria-selected={session.id === props.value}
        aria-describedby={tooltip?.session.id === session.id ? tooltipId : undefined}
        tabIndex={-1}
        className={optionClass}
        onClick={handleChoose}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleTooltipClose}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{session.title}</span>
          <span className="mt-1 block truncate text-xs text-slate-500">{session.projectPath}</span>
        </span>
        <span aria-hidden="true" className="w-4 shrink-0 text-blue-600">
          {session.id === props.value ? "✓" : ""}
        </span>
      </button>
    );
  }

  let selectedTitle = props.placeholder;

  if (selectedSession) {
    selectedTitle = selectedSession.title;
  }

  return (
    <>
      <button
        ref={triggerRef}
        id="session"
        type="button"
        role="combobox"
        aria-expanded={menuPosition !== null}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-activedescendant={menuPosition !== null ? listboxId + "-" + activeIndex : undefined}
        aria-describedby={tooltip && menuPosition === null ? tooltipId : undefined}
        disabled={props.disabled}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 outline-none transition focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={scheduleTooltipClose}
        onBlur={hideTooltip}
      >
        <span className="min-w-0 flex-1 truncate">{selectedTitle}</span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">▾</span>
      </button>

      {menuPosition !== null && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label="可用会话"
          style={menuPosition}
          className="fixed z-40 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl [color-scheme:light]"
        >
          {props.sessions.map(renderOption)}
        </div>,
        document.body,
      )}

      {tooltip !== null && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width, maxHeight: tooltip.maxHeight }}
          className="fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm leading-6 text-white shadow-xl [overflow-wrap:anywhere]"
          onMouseEnter={cancelTooltipTimer}
          onMouseLeave={scheduleTooltipClose}
        >
          <p className="mb-1 text-xs text-slate-400">完整标题</p>
          <p className="whitespace-pre-wrap">{tooltip.session.title}</p>
          <p className="mb-1 mt-3 text-xs text-slate-400">工程目录</p>
          <p className="whitespace-pre-wrap font-mono text-xs">{tooltip.session.projectPath}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
