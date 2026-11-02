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
  const [sessionSource, setSessionSource] = useState<"new" | "existing">("new");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [selectingProject, setSelectingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const restoreSettings = useCallback(function restoreSettings(saved: GuardSettings) {
    setSettings(saved);
  }, []);
  const { guard, loaded, missing, deleting, starting, pausing, error, start, pause, respond } = useGuard(guardId, restoreSettings);
  const active = guard.phase !== "paused";
  const locked = !loaded || deleting || active || starting || pausing;
  const createNewSession = guardId === null && sessionSource === "new";
  const pendingNewSession = guardId !== null && guard.settings?.sessionId === "";
  const hasSessionTarget = createNewSession ? newProjectPath.trim() !== "" : settings.sessionId !== "" || pendingNewSession;

  const availableSessions = [...sessions];
  const savedSessionId = guard.settings?.sessionId;
  if (savedSessionId && !availableSessions.some(function match(session) { return session.id === savedSessionId; })) {
    availableSessions.unshift({ id: savedSessionId, title: guard.sessionTitle, projectPath: guard.projectPath });
  }

  function handleStart() {
    if (createNewSession) {
      const newSettings = { ...settings, sessionId: "" };
      void start(newSettings, { projectPath: newProjectPath });
    } else {
      void start(settings);
    }
  }
  function selectNewSession() { setSessionSource("new"); }
  function selectExistingSession() {
    setSessionsLoading(true);
    setSessionsError("");
    setSessionSource("existing");
  }
  async function handleSelectProject() {
    setSelectingProject(true);
    setProjectError("");
    try {
      const response = await fetch("/api/project-directory", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法打开本地文件夹选择窗口。");
      if (!data.cancelled && typeof data.projectPath === "string") setNewProjectPath(data.projectPath);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "选择工程目录失败。");
    } finally {
      setSelectingProject(false);
    }
  }
  function handlePause() {
    if (guard.settings) restoreSettings(guard.settings);
    void pause();
  }

  // 空白模式不依赖已有会话，也不要求本机已经生成会话数据库。
  useEffect(function loadSessionsOnMount() {
    if (guardId === null && sessionSource === "new") return;
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
  }, [guardId, sessionSource]);

  let sessionPlaceholder = "请选择会话";
  let sessionStatus = "找到 " + availableSessions.length + " 个可用会话";

  if (sessionsLoading) {
    sessionPlaceholder = "正在扫描本机会话…";
    sessionStatus = "正在扫描本机会话…";
  } else if (sessionsError !== "") {
    sessionPlaceholder = "读取失败，请刷新页面重试";
    sessionStatus = "未能读取会话列表";
  } else if (availableSessions.length === 0) {
    sessionPlaceholder = "暂无可用会话";
    sessionStatus = "暂无已有会话，可以选择新建空白会话。";
  }
  if (pendingNewSession) sessionPlaceholder = "尚未绑定，开始时自动新建会话";

  let projectPath = guard.projectPath || "尚未选择会话";

  for (const session of availableSessions) {
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
              {guardId === null ? "关联已有会话，或直接新建空白会话；填好消息后点击开始守护。" : "查看和管理这个守护，离开页面后仍会继续执行。"}
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
              {guardId === null ? "可以继续已有对话，也可以在指定工程中从空白对话开始。" : "当前守护绑定的会话与工程目录。"}
            </p>
          </div>

          {guardId === null && (
            <fieldset disabled={locked} className="mb-5">
              <legend className="mb-2 text-sm font-medium text-slate-700">会话来源</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-checked:border-blue-500 has-checked:bg-blue-50">
                  <input type="radio" name="session-source" value="new" checked={sessionSource === "new"} onChange={selectNewSession} className="mt-1 accent-blue-600" />
                  <span><span className="block text-sm font-semibold">新建空白会话</span><span className="mt-1 block text-xs leading-5 text-slate-500">开始执行时自动创建并绑定，无需先打开 Codex。</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-checked:border-blue-500 has-checked:bg-blue-50">
                  <input type="radio" name="session-source" value="existing" checked={sessionSource === "existing"} onChange={selectExistingSession} className="mt-1 accent-blue-600" />
                  <span><span className="block text-sm font-semibold">关联已有会话</span><span className="mt-1 block text-xs leading-5 text-slate-500">沿用已有会话的上下文和工程目录。</span></span>
                </label>
              </div>
            </fieldset>
          )}

          {createNewSession ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">工程目录</p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleSelectProject} disabled={locked || selectingProject} aria-describedby="project-path-hint" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  {selectingProject ? "正在选择…" : "选择工程文件夹"}
                </button>
                <p role="status" className="break-all font-mono text-sm text-slate-700">{newProjectPath || "尚未选择文件夹"}</p>
              </div>
              <p id="project-path-hint" className="mt-2 text-xs leading-5 text-slate-500">打开本机文件夹选择窗口。选择目录不会创建会话；点击开始守护后才创建并发送首次消息。</p>
              {projectError && <p role="alert" className="mt-2 text-sm text-red-600">{projectError}</p>}
            </div>
          ) : (
            <>
              <label htmlFor="session" className="mb-2 block text-sm font-medium text-slate-700">当前会话</label>
              <SessionPicker
                sessions={availableSessions}
                value={settings.sessionId}
                onChange={handleSessionChange}
                placeholder={sessionPlaceholder}
                disabled={locked || sessionsLoading || sessionsError !== "" || availableSessions.length === 0}
              />
              <p role="status" className="mt-2 text-sm text-slate-500">{sessionStatus}</p>
              <p role="alert" className="mt-2 text-sm text-red-600">{pendingNewSession ? "" : sessionsError}</p>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">工程目录</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-700">{projectPath}</p>
              </div>
              {pendingNewSession && <p role="status" className="mt-3 text-sm text-slate-500">尚未绑定 Codex 会话。开始后将自动创建；成功绑定后，暂停、重试和再次开始都会沿用同一会话。</p>}
              {pendingNewSession && guard.phase === "needsInput" && <p role="alert" className="mt-3 text-sm text-amber-700">新建会话结果尚未确认，为避免重复创建，已停止自动重试。请先暂停并检查已有会话，再选择关联或重新开始。</p>}
            </>
          )}
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
              disabled={!loaded || locked || selectingProject || !hasSessionTarget || !settings.model || !settings.reasoning || !settings.startMessage.trim()}
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
