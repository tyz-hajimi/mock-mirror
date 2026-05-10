"use client";

import type {
  InterviewLog,
  InterviewMode,
  InterviewOutline,
  InterviewTurn,
  QuestionBlockEvaluation,
} from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { appendInterviewHistory } from "@/lib/history";

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

/** 普通题、追问口述：建议答题时长 */
const SUGGESTED_MS_VOICE = 6 * 60 * 1000;
/** 手撕代码（仅主题目）：建议作答时长 */
const SUGGESTED_MS_LIVE_CODING = 15 * 60 * 1000;

/** 每隔约此时长结束当前 MediaRecorder 并单独上传 ASR（区间约 40s–60s），上传后立即走识别，多段文本再拼接 */
const VOLC_SEGMENT_INTERVAL_MS = 45_000;

/** 单次分段识别结果最长字符数，超出截断，避免异常长文本撑爆 UI / 请求体 */
const VOLC_SEGMENT_PIECE_MAX_CHARS = 3500;

function truncateVolcPiece(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

/** 浏览器 Web Speech API（TS 默认 lib 可能未包含完整类型） */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window &
    typeof globalThis & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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
  const [speechLines, setSpeechLines] = useState<string[]>([]);
  const [speechInterim, setSpeechInterim] = useState("");
  const [volcSegmentLines, setVolcSegmentLines] = useState<string[]>([]);
  const [volcPanelOpen, setVolcPanelOpen] = useState(true);
  const [speechPanelOpen, setSpeechPanelOpen] = useState(true);
  const [turnsPanelOpen, setTurnsPanelOpen] = useState(true);
  const [questionEvaluations, setQuestionEvaluations] = useState<
    QuestionBlockEvaluation[]
  >([]);

  const [elapsedMs, setElapsedMs] = useState(0);
  const [warned, setWarned] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const segmentTickerRef = useRef<number | null>(null);
  const recordingClosingRef = useRef(false);
  /** 本答是否仍在进行（含分段间隙），供浏览器听写 onend 决定是否立即 restart */
  const answerRecordingActiveRef = useRef(false);
  const volcSegmentTextsRef = useRef<string[]>([]);
  const segmentWorkChainRef = useRef(Promise.resolve());
  const timerRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const elapsedRef = useRef(0);
  /** 本题计时起点，用于切回标签页时按真实经过时间校正显示 */
  const questionTimerStartRef = useRef<number | null>(null);
  /** 当前题开始作答时的「建议时长」阈值（毫秒），用于软提醒与 softWarn */
  const suggestedWarnAfterMsRef = useRef(SUGGESTED_MS_VOICE);
  const spokenKeyRef = useRef("");
  const savedReportRef = useRef(false);
  /** 主题目答完后若进入追问，暂存于此，供追问结束后一并详评 */
  const lastBlockMainAnswerRef = useRef<string | null>(null);
  const pendingQuestionEvalRef = useRef(0);
  const questionEvaluationsRef = useRef<QuestionBlockEvaluation[]>([]);
  /** 浏览器实时语音识别（与 MediaRecorder 并行） */
  const browserSpeechRef = useRef<SpeechRecognitionLike | null>(null);

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
    questionTimerStartRef.current = t0;
    timerRef.current = window.setInterval(() => {
      const e = Date.now() - questionTimerStartRef.current!;
      setElapsedMs(e);
      elapsedRef.current = e;
      const limit = suggestedWarnAfterMsRef.current;
      if (!warnedRef.current && e > limit) {
        warnedRef.current = true;
        setWarned(true);
      }
    }, 250);
  }, [stopTimer]);

  /** 仅当题目/追问真的变化时变化，避免因 questions 数组引用抖动导致计时被停掉却无法重启 */
  const currentQ = qi < questions.length ? questions[qi] : undefined;
  const currentMainFingerprint = currentQ
    ? `${currentQ.text}\u0001${currentQ.kind}\u0001${currentQ.category}`
    : "";

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
    setSpeechLines([]);
    setSpeechInterim("");
    setVolcSegmentLines([]);
    volcSegmentTextsRef.current = [];
    if (main.kind === "live_coding" && phase === "main") {
      suggestedWarnAfterMsRef.current = SUGGESTED_MS_LIVE_CODING;
    } else {
      suggestedWarnAfterMsRef.current = SUGGESTED_MS_VOICE;
    }
    if (main.kind === "live_coding" && phase === "main") setCode("");
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "interviewer" && last.text === qtext) return prev;
      return [...prev, { role: "interviewer", text: qtext }];
    });
    speak(qtext);
    startTimer();

    return () => stopTimer();
  }, [
    ready,
    qi,
    phase,
    followQ,
    questions.length,
    currentMainFingerprint,
    startTimer,
    stopTimer,
  ]);

  /** 切回标签页时校正已用时间（后台标签 setInterval 常被节流） */
  useEffect(() => {
    const sync = () => {
      if (
        document.visibilityState !== "visible" ||
        timerRef.current == null ||
        questionTimerStartRef.current == null
      )
        return;
      const e = Date.now() - questionTimerStartRef.current;
      setElapsedMs(e);
      elapsedRef.current = e;
      const limit = suggestedWarnAfterMsRef.current;
      if (!warnedRef.current && e > limit) {
        warnedRef.current = true;
        setWarned(true);
      }
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const fireBackgroundQuestionEval = useCallback(
    (payload: {
      questionIndex: number;
      mainQuestion: string;
      mainAnswer: string;
      followupQuestion: string | null;
      followupAnswer: string | null;
    }) => {
      const meta = questions[payload.questionIndex];
      if (!meta) return;
      pendingQuestionEvalRef.current += 1;
      const body = {
        resume,
        jd,
        company,
        mode,
        questionIndex: payload.questionIndex,
        category: meta.category,
        kind: meta.kind,
        mainQuestion: payload.mainQuestion,
        mainAnswer: payload.mainAnswer,
        followupQuestion: payload.followupQuestion,
        followupAnswer: payload.followupAnswer,
      };
      void (async () => {
        try {
          const res = await fetch("/api/evaluate-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = (await res.json()) as {
            result?: Record<string, unknown>;
            error?: string;
          };
          const item: QuestionBlockEvaluation = {
            questionIndex: payload.questionIndex,
            category: meta.category,
            kind: meta.kind,
            mainQuestion: payload.mainQuestion,
            followupQuestion: payload.followupQuestion,
            result: res.ok && data.result ? data.result : {},
            error: res.ok ? undefined : (data.error ?? "详评请求失败"),
            createdAt: new Date().toISOString(),
          };
          questionEvaluationsRef.current = [
            ...questionEvaluationsRef.current,
            item,
          ];
          setQuestionEvaluations([...questionEvaluationsRef.current]);
        } catch (e) {
          const item: QuestionBlockEvaluation = {
            questionIndex: payload.questionIndex,
            category: meta.category,
            kind: meta.kind,
            mainQuestion: payload.mainQuestion,
            followupQuestion: payload.followupQuestion,
            result: {},
            error: e instanceof Error ? e.message : "详评异常",
            createdAt: new Date().toISOString(),
          };
          questionEvaluationsRef.current = [
            ...questionEvaluationsRef.current,
            item,
          ];
          setQuestionEvaluations([...questionEvaluationsRef.current]);
        } finally {
          pendingQuestionEvalRef.current -= 1;
        }
      })();
    },
    [questions, resume, jd, company, mode],
  );

  useEffect(() => {
    if (!ready || questions.length === 0) return;
    if (qi < questions.length) return;
    if (savedReportRef.current) return;
    if (!outline) return;
    savedReportRef.current = true;
    let cancelled = false;
    void (async () => {
      const deadline = Date.now() + 15_000;
      while (
        pendingQuestionEvalRef.current > 0 &&
        Date.now() < deadline &&
        !cancelled
      ) {
        await new Promise((r) => setTimeout(r, 120));
      }
      if (cancelled) {
        savedReportRef.current = false;
        return;
      }
      const payload: InterviewLog = {
        resume,
        jd,
        company,
        mode,
        outline,
        turns,
        questionEvaluations: questionEvaluationsRef.current,
      };
      sessionStorage.setItem(LOG_KEY, JSON.stringify(payload));
      const hid = appendInterviewHistory(payload);
      router.push(`/report?id=${encodeURIComponent(hid)}`);
    })();
    return () => {
      cancelled = true;
    };
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

  function stopBrowserSpeech() {
    const r = browserSpeechRef.current;
    browserSpeechRef.current = null;
    if (!r) return;
    r.onend = null;
    try {
      r.stop();
    } catch {
      /* ignore */
    }
  }

  function clearSegmentTicker() {
    if (segmentTickerRef.current != null) {
      window.clearInterval(segmentTickerRef.current);
      segmentTickerRef.current = null;
    }
  }

  function enqueueSegmentWork(task: () => Promise<void>) {
    segmentWorkChainRef.current = segmentWorkChainRef.current
      .then(task)
      .catch(() => {});
    return segmentWorkChainRef.current;
  }

  function startSegmentRecorder() {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mr.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mr.start();
    mediaRecorderRef.current = mr;
  }

  function finalizeAnswerRecording() {
    answerRecordingActiveRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  async function rotateSegment(isFinal: boolean) {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") {
      if (isFinal) finalizeAnswerRecording();
      return;
    }
    const mimeType = mr.mimeType;
    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      mr.stop();
    });

    const blob = new Blob(chunksRef.current, { type: mimeType });

    if (!isFinal && !recordingClosingRef.current) {
      startSegmentRecorder();
    }

    if (blob.size >= 8) {
      try {
        const fd = new FormData();
        fd.append("audio", blob, "seg.webm");
        const tr = await fetch("/api/transcribe", { method: "POST", body: fd });
        const trData = await tr.json();
        if (!tr.ok) throw new Error(trData.error ?? "分段转写失败");
        const raw = (trData.text as string)?.trim() ?? "";
        const piece = raw ? truncateVolcPiece(raw, VOLC_SEGMENT_PIECE_MAX_CHARS) : "";
        if (piece) {
          volcSegmentTextsRef.current = [
            ...volcSegmentTextsRef.current,
            piece,
          ];
          setVolcSegmentLines((prev) => [...prev, piece]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "分段转写失败");
      }
    }

    if (isFinal) finalizeAnswerRecording();
  }

  async function startRecording() {
    setError(null);
    stopBrowserSpeech();
    clearSegmentTicker();
    segmentWorkChainRef.current = Promise.resolve();
    setSpeechLines([]);
    setSpeechInterim("");
    setVolcSegmentLines([]);
    volcSegmentTextsRef.current = [];
    recordingClosingRef.current = false;
    answerRecordingActiveRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setRecording(true);
      startSegmentRecorder();
      segmentTickerRef.current = window.setInterval(() => {
        if (recordingClosingRef.current) return;
        void enqueueSegmentWork(() => rotateSegment(false));
      }, VOLC_SEGMENT_INTERVAL_MS);

      const Ctor = getSpeechRecognitionCtor();
      if (Ctor) {
        const r = new Ctor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = "zh-CN";
        r.onresult = (ev) => {
          let interim = "";
          const nextFinals: string[] = [];
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const row = ev.results[i];
            const piece = row[0]?.transcript ?? "";
            if (row.isFinal) {
              const s = piece.trim();
              if (s) nextFinals.push(s);
            } else {
              interim += piece;
            }
          }
          if (nextFinals.length) {
            setSpeechLines((prev) => [...prev, ...nextFinals]);
          }
          setSpeechInterim(interim.trimEnd());
        };
        r.onerror = () => {
          /* no-speech 等较常见，不打断录音 */
        };
        r.onend = () => {
          if (
            answerRecordingActiveRef.current &&
            browserSpeechRef.current === r
          ) {
            try {
              r.start();
            } catch {
              /* ignore */
            }
          }
        };
        browserSpeechRef.current = r;
        try {
          r.start();
        } catch {
          browserSpeechRef.current = null;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法访问麦克风");
      clearSegmentTicker();
      recordingClosingRef.current = true;
      answerRecordingActiveRef.current = false;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      setRecording(false);
    }
  }

  async function onStopAndSubmit() {
    stopBrowserSpeech();
    recordingClosingRef.current = true;
    clearSegmentTicker();
    setBusy(true);
    try {
      await enqueueSegmentWork(() => rotateSegment(true));
      const text = volcSegmentTextsRef.current.join("\n").trim();
      if (!text) {
        setError("未识别到有效语音，请重试");
        return;
      }
      stopTimer();
      const stoppedAt = elapsedRef.current;
      const soft =
        warnedRef.current || stoppedAt > suggestedWarnAfterMsRef.current;
      await applyCandidateAnswer(text, soft, stoppedAt);
      setSpeechLines([]);
      setSpeechInterim("");
      setVolcSegmentLines([]);
      volcSegmentTextsRef.current = [];
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
        lastBlockMainAnswerRef.current = text;
        setPhase("followup");
        setFollowQ(fu.question);
        return;
      }
      fireBackgroundQuestionEval({
        questionIndex: qi,
        mainQuestion: currentMain,
        mainAnswer: text,
        followupQuestion: null,
        followupAnswer: null,
      });
    } else {
      const mainAns = lastBlockMainAnswerRef.current ?? "";
      lastBlockMainAnswerRef.current = null;
      fireBackgroundQuestionEval({
        questionIndex: qi,
        mainQuestion: currentMain,
        mainAnswer: mainAns || "(主题目回答缺失)",
        followupQuestion: followQ,
        followupAnswer: text,
      });
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
    const soft = warnedRef.current || stoppedAt > suggestedWarnAfterMsRef.current;
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
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <p>正在保存面试记录并跳转报告页…</p>
        <p className="mt-3 text-xs text-zinc-500">
          若仍在生成逐题后台详评，将短暂等待（最多约
          15 秒）后一并写入，便于在报告中复盘与追问 AI。
        </p>
      </div>
    );
  }

  const main = questions[qi];
  const progressLabel = `${qi + 1} / ${questions.length}`;
  const isLiveCodingMain =
    main.kind === "live_coding" && phase === "main";
  const suggestedMinutes = isLiveCodingMain ? 15 : 6;

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
        <span className="flex max-w-[min(100%,20rem)] flex-col items-end gap-0.5 text-right sm:max-w-none sm:items-end">
          <span>
            已用 {formatMs(elapsedMs)}
            <span className="ml-2 text-zinc-400 dark:text-zinc-500">
              · 建议时长 {suggestedMinutes} 分钟
              {isLiveCodingMain ? "（手撕代码）" : ""}
            </span>
          </span>
          {warned && (
            <span className="text-amber-600 dark:text-amber-400">
              已超过建议时长，仍可继续答
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
            本题以文本代码为准，不经过语音转写；建议作答 15 分钟（顶栏同步提示）；提交后仍可能收到针对实现的追问。
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
            约每 {VOLC_SEGMENT_INTERVAL_MS / 1000}{" "}
            秒自动切段并上传识别（约 40 秒～1
            分钟一档，上传后即识别、各段拼接成稿）；单段识别正文超过{" "}
            {VOLC_SEGMENT_PIECE_MAX_CHARS} 字会截断。停止后合并提交。下方另有浏览器逐句预览。
          </p>
        </section>
      )}

      {!isLiveCodingMain && (
        <details
          className="rounded-xl border border-blue-200/80 p-4 dark:border-blue-900/50"
          open={volcPanelOpen}
          onToggle={(e) => setVolcPanelOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <span>服务端识别（分段拼接）</span>
            <span
              aria-hidden
              className={`shrink-0 text-xs text-zinc-400 transition-transform dark:text-zinc-500 ${volcPanelOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            每段转写完成后会追加一行；过长单段会截断至约{" "}
            {VOLC_SEGMENT_PIECE_MAX_CHARS} 字。停止时再识别尾段并合并为完整回答（用于追问）。
          </p>
          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-zinc-100 bg-blue-50/50 p-3 text-sm dark:border-zinc-800 dark:bg-blue-950/20">
            {volcSegmentLines.length === 0 && !recording ? (
              <p className="text-zinc-400">
                录音进行中将在此显示已完成的各段火山识别结果。
              </p>
            ) : null}
            {volcSegmentLines.map((line, i) => (
              <p
                key={`v-${i}-${line.slice(0, 24)}`}
                className="border-b border-zinc-200/60 pb-2 text-zinc-800 last:border-0 last:pb-0 dark:border-zinc-700 dark:text-zinc-200"
              >
                {line}
              </p>
            ))}
            {recording && (
              <p className="text-xs text-zinc-500">
                当前段结束后会自动上传识别，并立即开始下一段录音。
              </p>
            )}
          </div>
        </details>
      )}

      {!isLiveCodingMain && (
        <details
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          open={speechPanelOpen}
          onToggle={(e) => setSpeechPanelOpen(e.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
            <span>实时转写预览</span>
            <span
              aria-hidden
              className={`shrink-0 text-xs text-zinc-400 transition-transform dark:text-zinc-500 ${speechPanelOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {getSpeechRecognitionCtor()
              ? "正在说话时，识别到的内容会按句追加到下方；灰色斜体为尚未定稿的临时片段。"
              : "当前环境不支持浏览器实时识别，仅能在停止录音后看到服务端转写结果。"}
          </p>
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            {speechLines.length === 0 &&
              !speechInterim &&
              !recording && (
                <p className="text-sm text-zinc-400">
                  开始录音后，句子会逐条出现在这里。
                </p>
              )}
            {speechLines.map((line, i) => (
              <p
                key={`${i}-${line.slice(0, 12)}`}
                className="border-b border-zinc-200/80 pb-2 text-sm leading-relaxed text-zinc-800 last:border-0 last:pb-0 dark:border-zinc-800 dark:text-zinc-200"
              >
                {line}
              </p>
            ))}
            {speechInterim ? (
              <p className="text-sm italic leading-relaxed text-zinc-500 dark:text-zinc-400">
                {speechInterim}
                {recording ? " …" : ""}
              </p>
            ) : null}
          </div>
        </details>
      )}

      <details
        className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        open={turnsPanelOpen}
        onToggle={(e) => setTurnsPanelOpen(e.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 [&::-webkit-details-marker]:hidden">
          <span>本轮记录</span>
          <span
            aria-hidden
            className={`shrink-0 text-[0.65rem] normal-case text-zinc-400 transition-transform dark:text-zinc-500 ${turnsPanelOpen ? "rotate-180" : ""}`}
          >
            ▼
          </span>
        </summary>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
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
      </details>

      <details className="rounded-xl border border-violet-200/80 p-4 dark:border-violet-900/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-violet-900 dark:text-violet-200 [&::-webkit-details-marker]:hidden">
          <span>
            后台逐题详评（已收到 {questionEvaluations.length} 条）
          </span>
          <span aria-hidden className="text-xs text-violet-400">
            ▼
          </span>
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          在切至下一题时异步请求 DeepSeek
          评判上一题（含追问若存在）。完整内容在面试结束后的报告页；此处为进行中的预览。
        </p>
        {questionEvaluations.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">暂无，完成并切题后会出现。</p>
        ) : (
          <ul className="mt-3 max-h-56 space-y-3 overflow-y-auto text-sm">
            {questionEvaluations.map((ev, i) => (
              <li
                key={`${ev.questionIndex}-${ev.createdAt}-${i}`}
                className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 dark:border-violet-900/40 dark:bg-violet-950/20"
              >
                <p className="font-medium text-zinc-800 dark:text-zinc-100">
                  第 {ev.questionIndex + 1} 题 · {ev.category}
                  {ev.error ?
                    <span className="ml-2 text-red-600 dark:text-red-400">
                      失败
                    </span>
                  : null}
                </p>
                {ev.error ?
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    {ev.error}
                  </p>
                : null}
                {typeof ev.result?.detailedFeedback === "string" ? (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {(ev.result.detailedFeedback as string).slice(0, 360)}
                    {(ev.result.detailedFeedback as string).length > 360 ?
                      "…"
                    : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
