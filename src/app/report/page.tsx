"use client";

import type {
  InterviewLog,
  InterviewTurn,
  QuestionBlockEvaluation,
} from "@/lib/types";
import { getInterviewHistoryEntry, patchInterviewHistoryLog } from "@/lib/history";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const LOG_KEY = "mm_log";

function formatEvalPreview(ev: QuestionBlockEvaluation) {
  if (ev.error) return `详评失败：${ev.error}`;
  const r = ev.result;
  const parts: string[] = [];
  if (typeof r.overallScore === "number") {
    parts.push(`综合 ${r.overallScore}/10`);
  }
  if (typeof r.detailedFeedback === "string" && r.detailedFeedback.trim()) {
    parts.push(r.detailedFeedback.trim());
  }
  return parts.length ? parts.join("\n\n") : JSON.stringify(r, null, 2);
}

function ReportInner() {
  const searchParams = useSearchParams();
  const historyId = searchParams.get("id");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<InterviewLog | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [evalPanelOpen, setEvalPanelOpen] = useState(true);
  const [recordPanelOpen, setRecordPanelOpen] = useState(true);

  useEffect(() => {
    if (historyId) {
      const entry = getInterviewHistoryEntry(historyId);
      if (entry?.log) {
        setLog(entry.log);
        setLoading(false);
        return;
      }
      setError("未找到该条历史记录，可能已被删除。");
      setLoading(false);
      return;
    }
    const raw = sessionStorage.getItem(LOG_KEY);
    if (!raw) {
      setError("没有面试记录，请从首页开始。");
      setLoading(false);
      return;
    }
    try {
      setLog(JSON.parse(raw) as InterviewLog);
    } catch {
      setError("记录解析失败。");
    }
    setLoading(false);
  }, [historyId]);

  useEffect(() => {
    if (!log) return;
    if (log.scoreReport != null) {
      setReport(log.scoreReport);
      return;
    }
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
        if (cancelled) return;
        const r = data.report;
        setReport(r);
        setLog((prev) => {
          if (!prev) return prev;
          const next: InterviewLog = { ...prev, scoreReport: r };
          try {
            sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
          } catch {
            /* ignore quota */
          }
          if (historyId) {
            patchInterviewHistoryLog(historyId, { scoreReport: r });
          }
          return next;
        });
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "评分失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [log, historyId]);

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
  const evaluations = log.questionEvaluations ?? [];
  const askAiHref =
    historyId ?
      `/ask-ai?id=${encodeURIComponent(historyId)}`
    : "/ask-ai";

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/40 lg:w-60 lg:border-b-0 lg:border-r lg:py-8 lg:pl-6 lg:pr-4">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          面试报告
        </h1>
        <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {log.company}
          </span>
          <span className="text-zinc-400"> · </span>
          模式 {log.mode}
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={askAiHref}
            className="rounded-lg bg-emerald-700 py-2 text-center text-xs font-medium text-white dark:bg-emerald-600"
          >
            问 AI
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 py-2 text-center text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          >
            首页（再来一次）
          </Link>
        </div>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          基于简历、JD、本场追问与详评向模型继续提问，请前往{" "}
          <Link href={askAiHref} className="font-medium text-emerald-800 underline dark:text-emerald-400">
            问 AI
          </Link>{" "}
          独立页面（支持多轮对话）。
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-8 lg:px-8 lg:py-10">
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

        <details
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          open={evalPanelOpen}
          onToggle={(e) => setEvalPanelOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <span>逐题后台详评（DeepSeek · 切题时生成）</span>
            <span
              aria-hidden
              className={`text-xs text-zinc-400 transition-transform dark:text-zinc-500 ${evalPanelOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            每道完整题（含追问若有）在进入下一题时已异步请求模型，专用于细粒度复盘；失败条目可能因网络或配额产生。
          </p>
          {evaluations.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">
              本次记录中暂无详评（例如老版本会话或未跑通接口）。
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {evaluations.map((ev, i) => (
                <li
                  key={`${ev.questionIndex}-${ev.createdAt}-${i}`}
                  className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <p className="text-xs font-medium text-zinc-500">
                    第 {ev.questionIndex + 1} 题 · {ev.category} ·{" "}
                    <span className="text-zinc-400">{ev.kind}</span>
                  </p>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {formatEvalPreview(ev)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </details>

        <details
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          open={recordPanelOpen}
          onToggle={(e) => setRecordPanelOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <span>完整面试记录</span>
            <span
              aria-hidden
              className={`text-xs text-zinc-400 transition-transform dark:text-zinc-500 ${recordPanelOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </summary>
          <ul className="mt-3 space-y-3 text-sm">
            {log.turns.map((t: InterviewTurn, i: number) => (
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
        </details>
      </main>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500">
          加载中…
        </div>
      }
    >
      <ReportInner />
    </Suspense>
  );
}
