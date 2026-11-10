"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

export default function EncyclopediaConcurrency() {
  const [current, setCurrent] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);

  useEffect(function loadSettings() {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/encyclopedia/settings", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "读取并发设置失败。");
        if (!controller.signal.aborted) {
          setCurrent(body.concurrency);
          setValue(String(body.concurrency));
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      }
    }
    void load();
    return function cleanup() { controller.abort(); };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const concurrency = Number(value);
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      setError("请输入大于 0 的整数。");
      return;
    }
    locked.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/encyclopedia/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存并发设置失败。");
      setCurrent(body.concurrency);
      setValue(String(body.concurrency));
      setMessage("已保存，全局最多同时执行 " + body.concurrency + " 个词条。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="ep-concurrency" aria-label="全局任务并发设置">
      <form onSubmit={save}>
        <label htmlFor="encyclopedia-concurrency">同时执行词条数</label>
        <input id="encyclopedia-concurrency" type="number" min="1" step="1" required
          value={value} disabled={saving} onChange={function change(event) { setValue(event.target.value); }} />
        <button className="ep-button" type="submit" disabled={saving || !value}>
          {saving ? "保存中…" : "保存"}
        </button>
        <span className="ep-muted">{current === null ? "尚未读取设置" : "当前上限：" + current}</span>
      </form>
      <p className="ep-muted">所有分类共用，重启后保留。调高立即补任务；调低让正在执行的任务继续，空出名额后再补任务。</p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
