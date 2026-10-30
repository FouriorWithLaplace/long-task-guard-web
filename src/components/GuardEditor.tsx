"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { GuardSettings, SessionSummary } from "@/types/guard";
import type { ChangeEvent } from "react";
import SessionPicker from "@/components/SessionPicker";
import ModelSelector from "@/components/ModelSelector";
import GuardStatus from "@/components/GuardStatus";
import GuardLogs from "@/components/GuardLogs";
import GuardRequests from "@/components/GuardRequests";
import { useGuard } from "@/hooks/useGuard";

export default function GuardEditor({ guardId = null }: { guardId?: string | null }) {
  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50";

  const [settings, setSettings] = useState<GuardSettings>({
    sessionId: "",
    model: "",
    reasoning: "",
    startMessage: "",
    retryMessage: "",
    completeMessage: "",
  });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const restoreSettings = useCallback(function restoreSettings(saved: GuardSettings) {
    setSettings(saved);
  }, []);
  const { guard, loaded, missing, deleting, starting, pausing, error, start, pause, respond } = useGuard(guardId, restoreSettings);
  const active = guard.phase !== "paused";
  const locked = !loaded || deleting || active || starting || pausing;

  function handleStart() { void start(settings); }
  function handlePause() {
    if (guard.settings) restoreSettings(guard.settings);
    void pause();
  }

  // 页面在浏览器中挂载后读取会话，刷新页面也会重新执行。
  useEffect(function loadSessionsOnMount() {
    const controller = new AbortController();

    async function loadSessions() {
      try {
        const response = await fetch("/api/sessions", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          let message = "读取会话失败";

          if (typeof data.error === "string") {
            message = data.error;
          }

          throw new Error(message);
        }

        if (!Array.isArray(data.sessions)) {
          throw new Error("服务器返回的会话列表格式不正确");
        }

        setSessions(data.sessions);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        let message = "无法读取本机会话";

        if (error instanceof Error) {
          message = error.message;
        }

        setSessionsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setSessionsLoading(false);
        }
      }
    }

    function cancelLoading() {
      controller.abort();
    }

    void loadSessions();

    return cancelLoading;
  }, []);

  let sessionPlaceholder = "请选择会话";
  let sessionStatus = "找到 " + sessions.length + " 个可用会话";

  if (sessionsLoading) {
    sessionPlaceholder = "正在扫描本机会话…";
    sessionStatus = "正在扫描本机会话…";
  } else if (sessionsError !== "") {
    sessionPlaceholder = "读取失败，请刷新页面重试";
    sessionStatus = "未能读取会话列表";
  } else if (sessions.length === 0) {
    sessionPlaceholder = "暂无可用会话";
    sessionStatus = "暂无可用会话，请先在 Codex 中创建会话后刷新页面";
  }

  let projectPath = guard.projectPath || "尚未选择会话";

  for (const session of sessions) {
    if (session.id === settings.sessionId) {
      projectPath = session.projectPath;
      break;
    }
  }

  function updateSetting(
    field: keyof GuardSettings,
    value: string,
  ) {
    // 复制当前设置
    const nextSettings = { ...settings };

    // 修改指定字段
    nextSettings[field] = value;

    // 把完整的新设置交给 React
    setSettings(nextSettings);
  }

  function handleSessionChange(sessionId: string) {
    updateSetting("sessionId", sessionId);
  }

  const handleModelSelectionChange = useCallback(function handleModelSelectionChange(
    model: string,
    reasoning: string,
  ) {
    function updateModelSelection(previous: GuardSettings) {
      const nextSettings = { ...previous };
      nextSettings.model = model;
      nextSettings.reasoning = reasoning;
      return nextSettings;
    }

    setSettings(updateModelSelection);
  }, []);

  function handleStartMessageChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const newValue = event.target.value;

    updateSetting("startMessage", newValue);
  }

  function handleRetryMessageChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const newValue = event.target.value;

    updateSetting("retryMessage", newValue);
  }

  function handleCompleteMessageChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const newValue = event.target.value;

    updateSetting("completeMessage", newValue);
  }

  if (guardId !== null && (missing || guard.instanceId === "")) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 [color-scheme:light]">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href="/guards" className="text-sm font-medium text-blue-600 hover:text-blue-800">← 守护总览</Link>
          <p role={missing || error ? "alert" : "status"} className="rounded-2xl bg-white p-6 text-slate-600">{error || "正在读取守护…"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 [color-scheme:light] sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav aria-label="页面导航" className="flex items-center gap-5 text-sm font-medium text-slate-500">
          <Link href="/" className="hover:text-blue-600">← 首页</Link>
          <Link href="/guards" className="hover:text-blue-600">守护总览</Link>
        </nav>
        {/* 页面标题 */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {guardId === null ? "新建守护" : guard.sessionTitle || "守护详情"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {guardId === null ? "选择会话并配置发送内容，点击开始守护后完成创建。" : "查看和管理这个守护，离开页面后仍会继续执行。"}
            </p>
          </div>

          <GuardStatus guard={guard} />
        </header>

        {/* 会话选择 */}
        <section
          aria-labelledby="session-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-5">
            <h2 id="session-heading" className="text-base font-semibold">
              会话
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              选择需要守护的已有会话，开始前请确认工程目录。
            </p>
          </div>

          <label
            htmlFor="session"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            当前会话
          </label>

          <SessionPicker
            sessions={sessions}
            value={settings.sessionId}
            onChange={handleSessionChange}
            placeholder={sessionPlaceholder}
            disabled={locked || sessionsLoading || sessionsError !== "" || sessions.length === 0}
          />

          <p role="status" className="mt-2 text-sm text-slate-500">
            {sessionStatus}
          </p>
          <p role="alert" className="mt-2 text-sm text-red-600">
            {sessionsError}
          </p>

          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">
              工程目录
            </p>
            <p className="mt-1 break-all font-mono text-sm text-slate-700">
              {projectPath}
            </p>
          </div>
        </section>

        {/* 执行设置 */}
        <section
          aria-labelledby="settings-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-6">
            <h2 id="settings-heading" className="text-base font-semibold">
              执行设置
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              分别设置首次开始、异常重试和正常结束后发送的内容。
            </p>
          </div>

          <ModelSelector
            restorePreference={guardId === null}
            model={active && guard.settings ? guard.settings.model : settings.model}
            reasoning={active && guard.settings ? guard.settings.reasoning : settings.reasoning}
            onChange={handleModelSelectionChange}
            locked={locked}
          />

          <div className="mt-6 space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="start-message"
                  className="text-sm font-medium text-slate-700"
                >
                  开始时发送
                </label>
                <span className="text-xs text-slate-400">
                  点击开始后发送
                </span>
              </div>

              <textarea
                id="start-message"
                disabled={locked}
                rows={3}
                value={settings.startMessage}
                onChange={handleStartMessageChange}
                placeholder="输入首次开始时发送的内容"
                className={`${fieldClass} resize-y leading-6`}
              />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="retry-message"
                  className="text-sm font-medium text-slate-700"
                >
                  中断重试时发送
                </label>
                <span className="text-xs text-slate-400">
                  意外中断后立即发送
                </span>
              </div>

              <textarea
                id="retry-message"
                disabled={locked}
                rows={3}
                value={settings.retryMessage}
                onChange={handleRetryMessageChange}
                placeholder="输入异常重试时发送的内容"
                className={`${fieldClass} resize-y leading-6`}
              />
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="complete-message"
                  className="text-sm font-medium text-slate-700"
                >
                  正常结束后发送
                </label>
                <span className="text-xs text-slate-400">
                  正常结束后立即发送
                </span>
              </div>

              <textarea
                id="complete-message"
                disabled={locked}
                rows={3}
                value={settings.completeMessage}
                onChange={handleCompleteMessageChange}
                placeholder="输入正常结束后继续执行的内容"
                className={`${fieldClass} resize-y leading-6`}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={handleStart}
              disabled={!loaded || locked || !settings.sessionId || !settings.model || !settings.reasoning || !settings.startMessage.trim()}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              开始守护
            </button>

            <button
              type="button"
              onClick={handlePause}
              disabled={guardId === null || deleting || (!active && !starting) || pausing || guard.phase === "stopping"}
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              暂停
            </button>

            <p className="text-xs leading-5 text-slate-500">
              暂停会停止当前执行，并取消后续自动调度。
            </p>
          </div>
          {error !== "" && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {deleting && <p role="status" className="mt-3 text-sm text-slate-500">正在暂停并删除这个守护…</p>}
          {guard.requests.map(function renderRequest(request) {
            return <GuardRequests key={request.id} request={request} onRespond={respond} />;
          })}
        </section>

        {/* 运行记录 */}
        <GuardLogs key={guard.instanceId} logs={guard.logs} />
        <footer className="pb-4 text-center text-xs text-slate-400">
          长任务守护 · 本机会话管理
        </footer>
      </div>
    </main>
  );
}
