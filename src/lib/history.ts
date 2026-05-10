import {
  BUILTIN_DEMO_HISTORY_ID,
  getBuiltinDemoHistoryEntry,
} from "./demo-interview-sample";
import type { InterviewHistoryEntry, InterviewLog } from "./types";

/** localStorage：仅持久化用户自己的归档；内置演示通过内存合并展示 */
export const HISTORY_STORAGE_KEY = "mm_interview_history";

export const MAX_HISTORY_ENTRIES = 50;

/** 用户在本机选择「删除」内置演示后，不再自动展示 */
export const BUILTIN_DEMO_HIDDEN_KEY = "mm_builtin_demo_hidden";

function loadUserInterviewHistoryRaw(): InterviewHistoryEntry[] {
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

/** 合并内置演示（所有人可见，除非用户隐藏） */
export function loadInterviewHistory(): InterviewHistoryEntry[] {
  if (typeof window === "undefined") return [];
  const user = loadUserInterviewHistoryRaw().filter(
    (e) => e.id !== BUILTIN_DEMO_HISTORY_ID,
  );
  const hidden = localStorage.getItem(BUILTIN_DEMO_HIDDEN_KEY) === "1";
  if (hidden) return user;
  return [getBuiltinDemoHistoryEntry(), ...user];
}

export function saveUserInterviewHistory(entries: InterviewHistoryEntry[]) {
  if (typeof window === "undefined") return;
  const withoutBuiltin = entries.filter((e) => e.id !== BUILTIN_DEMO_HISTORY_ID);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(withoutBuiltin));
}

/** 新完成一场面试时写入用户列表首条，返回可用于 URL 的 id */
export function appendInterviewHistory(log: InterviewLog): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const entry: InterviewHistoryEntry = {
    id,
    savedAt: new Date().toISOString(),
    log,
  };
  const user = loadUserInterviewHistoryRaw().filter(
    (e) => e.id !== BUILTIN_DEMO_HISTORY_ID,
  );
  const next = [entry, ...user].slice(0, MAX_HISTORY_ENTRIES);
  saveUserInterviewHistory(next);
  return id;
}

export function getInterviewHistoryEntry(
  id: string,
): InterviewHistoryEntry | null {
  if (typeof window !== "undefined") {
    if (
      id === BUILTIN_DEMO_HISTORY_ID &&
      localStorage.getItem(BUILTIN_DEMO_HIDDEN_KEY) !== "1"
    ) {
      return getBuiltinDemoHistoryEntry();
    }
  }
  return loadUserInterviewHistoryRaw().find((e) => e.id === id) ?? null;
}

export function removeInterviewHistoryEntry(id: string) {
  if (typeof window === "undefined") return;
  if (id === BUILTIN_DEMO_HISTORY_ID) {
    localStorage.setItem(BUILTIN_DEMO_HIDDEN_KEY, "1");
    return;
  }
  saveUserInterviewHistory(
    loadUserInterviewHistoryRaw().filter((e) => e.id !== id),
  );
}

/** 合并更新某条历史中的 log（如写入 scoreReport），内置演示不可改 */
export function patchInterviewHistoryLog(
  id: string,
  patch: Partial<InterviewLog>,
): boolean {
  if (typeof window === "undefined") return false;
  if (id === BUILTIN_DEMO_HISTORY_ID) return false;
  const list = loadUserInterviewHistoryRaw();
  const i = list.findIndex((e) => e.id === id);
  if (i === -1) return false;
  list[i] = { ...list[i], log: { ...list[i].log, ...patch } };
  saveUserInterviewHistory(list);
  return true;
}

export type { InterviewHistoryEntry } from "./types";
