"use client";

import {
  loadInterviewHistory,
  removeInterviewHistoryEntry,
  type InterviewHistoryEntry,
} from "@/lib/history";
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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">面镜 MockMirror</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          粘贴简历与 JD，生成大纲后开始语音模拟。口述内容仅保存为文字记录。
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/ask-ai" className="underline">
            仅问 AI（需先有面试记录或从历史打开）
          </Link>
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          面试历史
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          已完成的面试会保存在本浏览器（localStorage），可再次打开报告或向 AI 提问。
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            暂无归档。完成一场面试后会自动出现在这里。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((h) => {
              const when = new Date(h.savedAt).toLocaleString("zh-CN", {
                dateStyle: "short",
                timeStyle: "short",
              });
              const rounds = h.log.turns.length;
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {h.log.company || "未填公司"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {when} · 模式 {h.log.mode} · {rounds} 条轮次
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/report?id=${encodeURIComponent(h.id)}`}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
                    >
                      报告
                    </Link>
                    <Link
                      href={`/ask-ai?id=${encodeURIComponent(h.id)}`}
                      className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white dark:bg-emerald-600"
                    >
                      问 AI
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        removeInterviewHistoryEntry(h.id);
                        setHistory(loadInterviewHistory());
                      }}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700 dark:border-red-900/50 dark:text-red-400"
                    >
                      删除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
    </div>
  );
}
