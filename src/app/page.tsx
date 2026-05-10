"use client";

import {
  loadInterviewHistory,
  removeInterviewHistoryEntry,
  type InterviewHistoryEntry,
} from "@/lib/history";
import { BUILTIN_DEMO_HISTORY_ID } from "@/lib/demo-interview-sample";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { InterviewMode, InterviewOutline } from "@/lib/types";

const SESSION_KEY = "mm_session";

export default function SetupPage() {
  const router = useRouter();
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState<InterviewMode>("realistic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InterviewOutline | null>(null);
  const [history, setHistory] = useState<InterviewHistoryEntry[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  useEffect(() => {
    setHistory(loadInterviewHistory());
  }, []);

  async function onGenerateOutline() {
    setError(null);
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jd, company }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setPreview(data.outline as InterviewOutline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  function onStartInterview() {
    if (!preview) return;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ resume, jd, company, mode, outline: preview }),
    );
    router.push("/interview");
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col-reverse gap-6 px-4 py-8 lg:flex-row lg:gap-0 lg:px-6">
      <aside
        className={`flex shrink-0 flex-col border-t border-zinc-200 pt-4 transition-[width] duration-200 dark:border-zinc-800 lg:sticky lg:top-8 lg:h-fit lg:max-h-[calc(100vh-4rem)] lg:overflow-hidden lg:border-r lg:border-t-0 lg:pt-0 ${
          historyCollapsed ?
            "w-full lg:w-10 lg:min-w-[2.5rem] lg:shrink-0 lg:pr-1"
          : "w-full lg:w-[16.5rem] lg:min-w-[16.5rem] lg:overflow-y-auto lg:pr-4"
        }`}
      >
        {historyCollapsed ? (
          <div className="flex flex-row items-center justify-between gap-2 lg:flex-col lg:justify-start lg:gap-3 lg:py-1">
            <button
              type="button"
              onClick={() => setHistoryCollapsed(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 lg:w-full lg:flex-col lg:gap-0.5 lg:py-2.5 lg:text-[10px]"
              title="展开面试历史"
            >
              <span aria-hidden>▶</span>
              <span className="lg:hidden">展开历史</span>
              <span className="hidden text-[10px] lg:inline" aria-hidden>
                历史
              </span>
            </button>
            {history.length > 0 && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-center text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 lg:mx-auto">
                {history.length}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                  面试历史
                </h2>
                <p className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                  本机保存 · 可收起于左侧
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCollapsed(true)}
                className="shrink-0 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                title="收起侧栏"
                aria-label="收起面试历史侧栏"
              >
                ◀
              </button>
            </div>
            <div className="mt-2 min-h-0 flex-1 lg:overflow-y-auto lg:pr-0.5">
              {history.length === 0 ? (
                <p className="text-[11px] leading-snug text-zinc-400">
                  暂无。完成面试或查看内置示例后出现。
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => {
                    const when = new Date(h.savedAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const rounds = h.log.turns.length;
                    return (
                      <li
                        key={h.id}
                        className="rounded-lg border border-zinc-200/90 bg-zinc-50/80 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/40"
                      >
                        <p className="line-clamp-1 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                          {h.log.company || "未填公司"}
                          {h.id === BUILTIN_DEMO_HISTORY_ID ? (
                            <span className="ml-1 align-middle rounded bg-amber-100 px-1 py-px text-[10px] font-normal text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                              示例
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                          {when} · {h.log.mode} · {rounds}轮
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Link
                            href={`/report?id=${encodeURIComponent(h.id)}`}
                            className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] font-medium dark:border-zinc-600"
                          >
                            报告
                          </Link>
                          <Link
                            href={`/ask-ai?id=${encodeURIComponent(h.id)}`}
                            className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-emerald-600"
                          >
                            AI
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              removeInterviewHistoryEntry(h.id);
                              setHistory(loadInterviewHistory());
                            }}
                            className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-600 dark:border-red-900/40 dark:text-red-400"
                          >
                            删
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-8 lg:pl-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            面镜 MockMirror
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            粘贴简历与 JD，生成大纲后开始语音模拟。口述内容仅保存为文字记录。
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            <Link href="/ask-ai" className="underline">
              仅问 AI（需先有面试记录或从历史打开）
            </Link>
          </p>
        </header>

        <section className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          目标公司
          <input
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-800 dark:bg-zinc-950"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="例如：某厂 · 某部门"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          岗位 JD
          <textarea
            className="min-h-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-800 dark:bg-zinc-950"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="粘贴职位描述与要求"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          简历
          <textarea
            className="min-h-48 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-800 dark:bg-zinc-950"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="粘贴简历全文或节选"
          />
        </label>

        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-2 font-medium">模式</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "realistic"}
              onChange={() => setMode("realistic")}
            />
            拟真（无参考答案，追问更狠）
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "assist"}
              onChange={() => setMode("assist")}
            />
            辅助（可生成口述要点）
          </label>
        </fieldset>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onGenerateOutline}
            disabled={loading || !resume.trim() || !jd.trim()}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? "生成中…" : "生成面试大纲"}
          </button>
          <button
            type="button"
            onClick={onStartInterview}
            disabled={!preview}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium dark:border-zinc-700 disabled:opacity-50"
          >
            开始面试
          </button>
        </div>
      </section>

      {preview && (
        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">大纲预览</h2>
          <ul className="mt-3 space-y-4 text-sm">
            {preview.categories.map((c) => (
              <li key={c.id}>
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {c.title}
                  {c.kind === "live_coding" && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                      LeetCode 手撕 · 须交完整代码
                    </span>
                  )}
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
                  {c.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </section>
      )}
      </main>
    </div>
  );
}
