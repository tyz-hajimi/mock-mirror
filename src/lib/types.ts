export type InterviewMode = "assist" | "realistic";

export type OutlineCategoryKind =
  | "basics"
  | "live_coding"
  | "system_design"
  | "project"
  | "pressure"
  | string;

export type OutlineCategory = {
  id: string;
  title: string;
  kind: OutlineCategoryKind;
  questions: string[];
};

export type InterviewOutline = {
  categories: OutlineCategory[];
};

export type TurnRole = "interviewer" | "candidate";

export type InterviewTurn = {
  role: TurnRole;
  text: string;
  /** ms since question start (rough, client-side) */
  elapsedMs?: number;
  /** soft warning shown (e.g. exceeded suggested duration) */
  softWarn?: boolean;
};

export type InterviewLog = {
  resume: string;
  jd: string;
  company: string;
  mode: InterviewMode;
  outline: InterviewOutline;
  turns: InterviewTurn[];
};
