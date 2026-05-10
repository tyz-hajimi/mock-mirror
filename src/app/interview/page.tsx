"use client";

import type {
  InterviewMode,
  InterviewOutline,
  InterviewTurn,
} from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_KEY = "mm_session";
const LOG_KEY = "mm_log";

type FlatQ = { category: string; kind: string; text: string };

function flatten(outline: InterviewOutline): FlatQ[] {
  const list: FlatQ[] = [];
  for (const c of outline.categories) {
    for (const q of c.questions) {
      list.push({ category: c.title, kind: c.kind, text: q });
    }
  }
  return list;
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export default function InterviewPage() {
  const router = useRouter();
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState<InterviewMode>("realistic");
  const [outline, setOutline] = useState<InterviewOutline | null>(null);
  const [questions, setQuestions] = useState<FlatQ[]>([]);

  const [qi, setQi] = useState(0);
  const [phase, setPhase] = useState<"main" | "followup">("main");
  const [followQ, setFollowQ] = useState<string | null>(null);
  const [turns, setTurns] = useState<InterviewTurn[]>([]);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveQuestion, setLiveQuestion] = useState("");

  const [hints, setHints] = useState<string | null>(null);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [code, setCode] = useState("");

  const suggestedMs = 120_000;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [warned, setWarned] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const elapsedRef = useRef(0);
  const spokenKeyRef = useRef("");
  const savedReportRef = useRef(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setBootError("请先在上一步填写并生成大纲。");
      return;
    }
    try {
      const s = JSON.parse(raw) as {
        resume: string;
        jd: string;
        company: string;
        mode: InterviewMode;
        outline: InterviewOutline;
      };
      setResume(s.resume);
      setJd(s.jd);
      setCompany(s.company);
      setMode(s.mode === "assist" ? "assist" : "realistic");
      setOutline(s.outline);
      setQuestions(flatten(s.outline));
      setReady(true);
    } catch {
      setBootError("会话数据损坏，请返回首页重来。");
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setElapsedMs(0);
    elapsedRef.current = 0;
    setWarned(false);
    warnedRef.current = false;
    const t0 = Date.now();
    timerRef.current = window.setInterval(() => {
      const e = Date.now() - t0;
      setElapsedMs(e);
      elapsedRef.current = e;
      if (!warnedRef.current && e > suggestedMs) {
        warnedRef.current = true;
        setWarned(true);
      }
    }, 400);
  }, [stopTimer, suggestedMs]);

  /** 新题或追问：插入面试官发言、播报、软计时 */
  useEffect(() => {
    if (!ready || questions.length === 0) return;
    if (qi >= questions.length) return;

    const main = questions[qi];
    const qtext = phase === "followup" && followQ ? followQ : main.text;
    const spokenKey = `${qi}-${phase}-${followQ ?? ""}`;
    if (spokenKeyRef.current === spokenKey) return;
    spokenKeyRef.current = spokenKey;

    setLiveQuestion(qtext);
    setHints(null);
    setError(null);
    if (main.kind === "live_coding" && phase === "main") setCode("");
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "interviewer" && last.text === qtext) return prev;
      return [...prev, { role: "interviewer", text: qtext }];
    });
    speak(qtext);
    startTimer();

    return () => stopTimer();
  }, [ready, qi, phase, followQ, questions, startTimer, stopTimer]);

  useEffect(() => {
    if (!ready || questions.length === 0) return;
    if (qi < questions.length) return;
    if (savedReportRef.current) return;
    if (!outline) return;
    savedReportRef.current = true;
    sessionStorage.setItem(
      LOG_KEY,
      JSON.stringify({
        resume,
        jd,
        company,
        mode,
        outline,
        turns,
      }),
    );
    router.push("/report");
  }, [
    ready,
    qi,
    questions.length,
    outline,
    resume,
    jd,
    company,
    mode,
    turns,
    router,
  ]);

  async function loadHints(q: string) {
    if (mode !== "assist") return;
    setHintsLoading(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, resume }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "要点失败");
      setHints(data.hints as string);
    } catch (e) {
      setHints(e instanceof Error ? e.message : "要点生成失败");
    } finally {
      setHintsLoading(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法访问麦克风");
    }
  }

  async function stopRecording(): Promise<Blob | null> {
    const mr = mediaRecorderRef.current;
    if (!mr) return null;
    return new Promise((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        mr.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      mr.stop();
    });
  }

  async function submitAnswer(blob: Blob) {
    stopTimer();
    const stoppedAt = elapsedRef.current;
    const soft = warnedRef.current || stoppedAt > suggestedMs;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "answer.webm");
      const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
      const trData = await tr.json();
      if (!tr.ok) throw new Error(trData.error ?? "转写失败");
      const text =
        (trData.text as string)?.trim() || "（未识别到有效语音，可重录）";

      await applyCandidateAnswer(text, soft, stoppedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  async function applyCandidateAnswer(
    text: string,
    soft: boolean,
    stoppedAt: number,
  ) {
    const currentMain = questions[qi].text;
    const phaseWhen = phase;

    setTurns((prev) => [
      ...prev,
      {
        role: "candidate",
        text,
        elapsedMs: stoppedAt,
        softWarn: soft,
      },
    ]);

    if (phaseWhen === "main") {
      const fr = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestion: currentMain,
          answerTranscript: text,
          mode,
        }),
      });
      const fdData = await fr.json();
      if (!fr.ok) throw new Error(fdData.error ?? "追问失败");
      const fu = fdData.followup as { question: string } | null;
      if (fu?.question) {
        setPhase("followup");
        setFollowQ(fu.question);
        return;
      }
    }

    setPhase("main");
    setFollowQ(null);
    setQi((q) => q + 1);
  }

  async function submitCodeAnswer() {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请填写完整代码后再提交");
      return;
    }
    stopTimer();
    const stoppedAt = elapsedRef.current;
    const soft = warnedRef.current || stoppedAt > suggestedMs;
    const text = `【手撕代码】\n\`\`\`\n${trimmed}\n\`\`\``;
    setBusy(true);
    try {
      await applyCandidateAnswer(text, soft, stoppedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  async function onStopAndSubmit() {
    const blob = await stopRecording();
    if (!blob || blob.size < 16) {
      setError("录音过短或未取得音频");
      return;
    }
    await submitAnswer(blob);
  }

  if (bootError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-red-700 dark:text-red-300">{bootError}</p>
        <Link href="/" className="mt-6 inline-block text-sm underline">
          返回首页
        </Link>
      </div>
    );
  }

  if (!ready || !outline || questions.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-zinc-500">
        加载中…
      </div>
    );
  }

  if (qi >= questions.length) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm">
        正在跳转报告页…
      </div>
    );
  }

  const main = questions[qi];
  const progressLabel = `${qi + 1} / ${questions.length}`;
  const isLiveCodingMain =
    main.kind === "live_coding" && phase === "main";

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <Link href="/" className="underline">
          退出
        </Link>
        <span>
          第 {progressLabel} 题 · {main.category}
          {main.kind === "live_coding" ? " · 手撕代码" : ""}
        </span>
        <span>
          已用 {formatMs(elapsedMs)}
          {warned && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              （已超过建议时长，仍可继续答）
            </span>
          )}
        </span>
      </div>

      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">面试官</h2>
        <p className="mt-3 text-lg leading-relaxed">{liveQuestion}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => speak(liveQuestion)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm dark:border-zinc-600"
          >
            复读题目（合成语音）
          </button>
          {mode === "assist" && !isLiveCodingMain && (
            <button
              type="button"
              onClick={() => loadHints(liveQuestion)}
              disabled={hintsLoading}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-black disabled:opacity-50"
            >
              {hintsLoading ? "生成要点…" : "生成口述要点"}
            </button>
          )}
        </div>
        {hints && mode === "assist" && !isLiveCodingMain && (
          <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {hints}
          </pre>
        )}
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {isLiveCodingMain && (
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            作答区（请提交完整代码）
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              rows={18}
              placeholder="// 在此编写可提交的完整代码（函数/类，或含 main 的解法均可）"
              className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <button
            type="button"
            onClick={submitCodeAnswer}
            disabled={busy}
            className="rounded-full bg-foreground py-3 text-center text-sm font-medium text-background disabled:opacity-50"
          >
            提交代码
          </button>
          <p className="text-center text-xs text-zinc-500">
            本题以文本代码为准，不经过语音转写；提交后仍可能收到针对实现的追问。
          </p>
        </section>
      )}

      {!isLiveCodingMain && (
        <section className="flex flex-col gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={busy}
              className="rounded-full bg-foreground py-3 text-center text-sm font-medium text-background disabled:opacity-50"
            >
              开始录音
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopAndSubmit}
              disabled={busy}
              className="rounded-full border-2 border-red-500 py-3 text-center text-sm font-medium text-red-600 disabled:opacity-50"
            >
              停止并提交本段回答
            </button>
          )}
          <p className="text-center text-xs text-zinc-500">
            录音在服务端转为文字；不保存音频文件。需服务器安装 ffmpeg，并配置火山
            ASR；未配置时可走 MOCK_ASR_TEXT 占位。
          </p>
        </section>
      )}

      <section>
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          本轮记录
        </h3>
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
          {turns.slice(-12).map((t, i) => (
            <li
              key={i}
              className={
                t.role === "interviewer"
                  ? "text-zinc-800 dark:text-zinc-200"
                  : "text-zinc-600 dark:text-zinc-400"
              }
            >
              <span className="font-medium">
                {t.role === "interviewer" ? "面试官" : "你"}
                {t.softWarn ? "（已超过建议时长）" : ""}：
              </span>
              {t.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
