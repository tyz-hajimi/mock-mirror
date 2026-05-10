"use client";

import type { InterviewTurn } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

type Log = {
  resume: string;
  jd: string;
  company: string;
  mode: string;
  outline: unknown;
  turns: InterviewTurn[];
};

const LOG_KEY = "mm_log";

export default function ReportPage() {
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<Log | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(LOG_KEY);
    if (!raw) {
      setError("没有面试记录，请从首页开始。");
      setLoading(false);
      return;
    }
    try {
      setLog(JSON.parse(raw) as Log);
    } catch {
      setError("记录解析失败。");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!log) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume: log.resume,
            jd: log.jd,
            company: log.company,
            mode: log.mode,
            turns: log.turns,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "评分失败");
        if (!cancelled) setReport(data.report);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "评分失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [log]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500">
        加载中…
      </div>
    );
  }

  if (error && !log) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <Link href="/" className="mt-6 inline-block text-sm underline">
          返回首页
        </Link>
      </div>
    );
  }

  if (!log) return null;

  const r = report as Record<string, unknown> | null;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">面试报告</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {log.company} · 模式 {log.mode}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-600"
        >
          再来一次
        </Link>
      </header>

      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {error}
        </p>
      )}

      {r && (
        <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">AI 总评</h2>
          <p className="mt-3 text-2xl font-semibold">
            {(r.total as number)?.toFixed?.(1) ?? r.total} / 10
          </p>
          {typeof r.summary === "string" && (
            <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {r.summary}
            </p>
          )}
          {Array.isArray(r.improvements) && (
            <ul className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              {(r.improvements as string[]).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <pre className="mt-6 max-h-64 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
            {JSON.stringify(r.dimensions ?? {}, null, 2)}
          </pre>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">完整文字记录</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {log.turns.map((t, i) => (
            <li
              key={i}
              className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {t.role === "interviewer" ? "面试官" : "你"}
                {t.softWarn ? " · 超时提示" : ""}
              </span>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
