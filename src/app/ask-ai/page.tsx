"use client";

import type { InterviewLog } from "@/lib/types";
import { getInterviewHistoryEntry } from "@/lib/history";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const LOG_KEY = "mm_log";

type ChatTurn = { role: "user" | "assistant"; text: string };

/** 将报告页同源的总评 JSON 排版为对话正文（纯本地，不请求模型） */
function formatScoreReportAsAiPreface(report: unknown): string {
  const r = report as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return "（总评数据为空或无法解析）";

  const lines: string[] = ["【面试总评】", ""];

  if (typeof r.total === "number") {
    lines.push(`综合分：${r.total.toFixed(1)} / 10`);
    lines.push("");
  } else if (r.total != null) {
    lines.push(`综合分：${String(r.total)} / 10`);
    lines.push("");
  }

  if (typeof r.summary === "string" && r.summary.trim()) {
    lines.push(r.summary.trim());
    lines.push("");
  }

  if (Array.isArray(r.improvements) && r.improvements.length > 0) {
    lines.push("改进建议：");
    (r.improvements as string[]).forEach((x, i) => {
      if (x?.trim()) lines.push(`${i + 1}. ${x.trim()}`);
    });
    lines.push("");
  }

  if (r.dimensions && typeof r.dimensions === "object") {
    lines.push("维度得分（供参考）：");
    lines.push(JSON.stringify(r.dimensions, null, 2));
  }

  return lines.join("\n").trim();
}

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

  useEffect(() => {
    if (!log) return;
    const cachedIntro =
      "以下内容与「面试报告」页中的 AI 总评一致，已缓存于本场记录中；此处仅做排版展示，不额外调用模型。\n\n";

    if (log.scoreReport != null) {
      const body = formatScoreReportAsAiPreface(log.scoreReport);
      setChatMessages([
        {
          role: "assistant",
          text: `${cachedIntro}${body}`,
        },
      ]);
      return;
    }

    setChatMessages([
      {
        role: "assistant",
        text: "【提示】本场记录里还没有缓存的面试总评。请先在左侧打开「查看报告」，等待总评加载完成（会自动写入本场记录与历史）；再回到或刷新本页，首条将展示与报告相同格式的总评（仍不调用模型）。在此之前，你仍可继续在下方向 AI 提问，后续回复会走对话模型。",
      },
    ]);
  }, [log]);

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

  const inputDisabled = chatBusy;

  return (
    <div className="flex min-h-[100dvh] w-full max-w-full flex-1 flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 border-zinc-200 bg-zinc-50/80 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/40 lg:w-60 lg:border-r lg:py-6 lg:pl-6 lg:pr-4">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          问 AI
        </h1>
        <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {log.company}
          </span>
          <span className="text-zinc-400"> · </span>
          模式 {log.mode}
          <span className="mt-1.5 block text-zinc-500">
            首条总评来自已缓存的报告数据；追问才调用模型
          </span>
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={reportHref}
            className="rounded-lg border border-zinc-300 py-2 text-center text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          >
            查看报告
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 py-2 text-center text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          >
            首页
          </Link>
        </div>
        <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
          可就简历匹配、某题答法、知识面、如何补弱项等连续多轮提问；对话仅保存在本页内存，刷新后清空。
        </p>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-8">
          <div className="max-w-3xl space-y-8 text-sm leading-relaxed">
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ?
                    "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-700 dark:text-zinc-300"
                }
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  {m.role === "user" ? "你" : "AI"}
                </span>
                <div className="mt-2 whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
          </div>
        </div>

        <footer className="shrink-0 border-t border-zinc-200 bg-background px-4 py-4 dark:border-zinc-800 lg:px-10">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              输入问题
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                rows={3}
                disabled={inputDisabled}
                placeholder="在总评基础上继续提问，支持多段文字…"
                className="mt-1 w-full resize-y border-0 border-b border-zinc-300 bg-transparent px-0 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:focus:border-zinc-400"
              />
            </label>
            <button
              type="button"
              onClick={() => void sendChat()}
              disabled={inputDisabled || !chatInput.trim()}
              className="shrink-0 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
            >
              {chatBusy ? "生成中…" : "发送"}
            </button>
          </div>
        </footer>
      </main>
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
