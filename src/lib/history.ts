import type { InterviewLog } from "./types";

/** localStorage：跨会话的面试归档（仅浏览器本地） */
export const HISTORY_STORAGE_KEY = "mm_interview_history";

export const MAX_HISTORY_ENTRIES = 50;

export type InterviewHistoryEntry = {
  id: string;
  savedAt: string;
  log: InterviewLog;
};

export function loadInterviewHistory(): InterviewHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is InterviewHistoryEntry =>
        Boolean(x) &&
        typeof x === "object" &&
        typeof (x as InterviewHistoryEntry).id === "string" &&
        typeof (x as InterviewHistoryEntry).savedAt === "string" &&
        (x as InterviewHistoryEntry).log != null &&
        typeof (x as InterviewHistoryEntry).log === "object",
    );
  } catch {
    return [];
  }
}

export function saveInterviewHistory(entries: InterviewHistoryEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

/** 新完成一场面试时写入列表首条，返回可用于 URL 的 id */
export function appendInterviewHistory(log: InterviewLog): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const entry: InterviewHistoryEntry = {
    id,
    savedAt: new Date().toISOString(),
    log,
  };
  const next = [entry, ...loadInterviewHistory()].slice(
    0,
    MAX_HISTORY_ENTRIES,
  );
  saveInterviewHistory(next);
  return id;
}

export function getInterviewHistoryEntry(
  id: string,
): InterviewHistoryEntry | null {
  return loadInterviewHistory().find((e) => e.id === id) ?? null;
}

export function removeInterviewHistoryEntry(id: string) {
  saveInterviewHistory(loadInterviewHistory().filter((e) => e.id !== id));
}
