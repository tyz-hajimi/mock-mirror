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

/** 某一题（主题目 ± 追问）在切至下一题间隙由模型生成的详评，供报告与复盘 */
export type QuestionBlockEvaluation = {
  questionIndex: number;
  category: string;
  kind: string;
  mainQuestion: string;
  followupQuestion: string | null;
  /** 模型返回的 JSON（结构见 prompts） */
  result: Record<string, unknown>;
  error?: string;
  createdAt: string;
};

export type InterviewLog = {
  resume: string;
  jd: string;
  company: string;
  mode: InterviewMode;
  outline: InterviewOutline;
  turns: InterviewTurn[];
  /** 逐题详评（在进入下一题时后台生成，可能因网络失败条目缺失） */
  questionEvaluations?: QuestionBlockEvaluation[];
};
