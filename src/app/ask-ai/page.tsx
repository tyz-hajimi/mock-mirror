"use client";

import type { InterviewLog } from "@/lib/types";
import { getInterviewHistoryEntry } from "@/lib/history";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const LOG_KEY = "mm_log";

type ChatTurn = { role: "user" | "assistant"; text: string };

function AskAiInner() {
  const searchParams = useSearchParams();
  const historyId = searchParams.get("id");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<InterviewLog | null>(null);
  const [loading, setLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    if (historyId) {
      const entry = getInterviewHistoryEntry(historyId);
      if (entry?.log) {
        setLog(entry.log);
        setLoading(false);
        return;
      }
      setError("未找到该条历史，可能已从本机删除。");
      setLoading(false);
      return;
    }
    const raw = sessionStorage.getItem(LOG_KEY);
    if (!raw) {
      setError(
        "没有可关联的面试记录。请先完成一场面试，或在首页「面试历史」中打开一场后再来提问。",
      );
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

  const sendChat = useCallback(async () => {
    if (!log) return;
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    const prior = chatMessages;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/interview-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: log.resume,
          jd: log.jd,
          company: log.company,
          mode: log.mode,
          turns: log.turns,
          questionEvaluations: log.questionEvaluations,
          priorMessages: prior,
          userMessage: q,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "对话失败");
      const reply = data.reply as string;
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "对话失败";
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: `（请求失败）${msg}` },
      ]);
    } finally {
      setChatBusy(false);
    }
  }, [log, chatInput, chatBusy, chatMessages]);

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

  const reportHref =
    historyId ?
      `/report?id=${encodeURIComponent(historyId)}`
    : "/report";

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">问 AI</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {log.company} · 模式 {log.mode} · 上下文含简历、JD、本场问答与详评摘录
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={reportHref}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-600"
          >
            查看报告
          </Link>
          <Link
            href="/"
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-600"
          >
            首页
          </Link>
        </div>
      </header>

      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        可就简历匹配、某题答法、知识面、如何补弱项等连续多轮提问；对话仅保存在本页内存，刷新后清空。
      </p>

      <div className="flex max-h-[min(60vh,28rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-emerald-200/90 bg-white p-4 dark:border-emerald-900/50 dark:bg-zinc-950/40">
        {chatMessages.length === 0 ? (
          <p className="text-sm text-zinc-400">
            例如：「就第 3 题而言，我的表述哪里最不清晰？」「对照 JD，我简历还缺哪类项目？」
          </p>
        ) : null}
        {chatMessages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user" ?
                "rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40"
              : "rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed dark:bg-zinc-900/80"
            }
          >
            <span className="text-xs font-medium text-zinc-500">
              {m.role === "user" ? "你" : "AI"}
            </span>
            <p className="mt-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          你的问题
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            rows={4}
            disabled={chatBusy}
            placeholder="结合本场面试记录提问…"
            className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          onClick={() => void sendChat()}
          disabled={chatBusy || !chatInput.trim()}
          className="shrink-0 rounded-full bg-emerald-700 px-6 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
        >
          {chatBusy ? "生成中…" : "发送"}
        </button>
      </div>
    </div>
  );
}

export default function AskAiPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500">
          加载中…
        </div>
      }
    >
      <AskAiInner />
    </Suspense>
  );
}
