"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { GuardRequest } from "@/types/guard";

interface Props {
  request: GuardRequest;
  onRespond: (id: string | number, response: object) => Promise<void>;
}

export default function GuardRequests({ request, onRespond }: Props) {
  const [sending, setSending] = useState(false);

  async function respond(response: object) {
    setSending(true);
    try {
      await onRespond(request.id, response);
    } finally {
      setSending(false);
    }
  }

  function handleAccept() { void respond({ decision: "accept" }); }
  function handleDecline() { void respond({ decision: "decline" }); }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const answers: Record<string, string> = {};
    for (const question of request.questions) answers[question.id] = String(data.get(question.id) || "");
    void respond({ answers: answers });
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-medium text-slate-800">{request.title}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{request.detail}</pre>
      {request.kind === "approval" ? (
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={handleAccept} disabled={sending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">允许本次</button>
          <button type="button" onClick={handleDecline} disabled={sending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">拒绝</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {request.questions.map(function renderQuestion(question) {
            const listId = "answers-" + request.id + "-" + question.id;
            return (
              <label key={question.id} className="block text-sm text-slate-700">
                {question.question}
                <input name={question.id} type={question.secret ? "password" : "text"} list={listId} required disabled={sending} autoComplete="off" className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                <datalist id={listId}>
                  {question.options.map(function renderOption(option) { return <option key={option} value={option} />; })}
                </datalist>
              </label>
            );
          })}
          <button type="submit" disabled={sending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">发送回答</button>
        </form>
      )}
    </div>
  );
}
