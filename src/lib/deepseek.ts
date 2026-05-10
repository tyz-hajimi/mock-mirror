import {
  FOLLOWUP_SYSTEM,
  INTERVIEW_CHAT_SYSTEM,
  OUTLINE_SYSTEM,
  QUESTION_BLOCK_EVAL_SYSTEM,
  SCORE_SYSTEM,
} from "./prompts";
import type {
  InterviewMode,
  InterviewOutline,
  InterviewTurn,
  QuestionBlockEvaluation,
} from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function getKey() {
  const k = process.env.DEEPSEEK_API_KEY;
  if (!k) throw new Error("缺少环境变量 DEEPSEEK_API_KEY");
  return k;
}

async function chatJson(system: string, user: string) {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeepSeek HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  return extractJson(text);
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error(`模型未返回 JSON：${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export async function generateOutline(input: {
  resume: string;
  jd: string;
  company: string;
}) {
  const user = `目标公司：${input.company}\n\n【岗位 JD】\n${input.jd}\n\n【简历】\n${input.resume}`;
  const raw = await chatJson(OUTLINE_SYSTEM, user);
  return raw as InterviewOutline;
}

export async function maybeFollowup(input: {
  mainQuestion: string;
  answerTranscript: string;
  mode: InterviewMode;
}) {
  const user =
    input.mode === "realistic"
      ? `当前为题主问题：\n${input.mainQuestion}\n\n候选人最新回答（语音转写）：\n${input.answerTranscript}`
      : `当前为题主问题：\n${input.mainQuestion}\n\n候选人最新回答（可参考）：\n${input.answerTranscript}\n（辅助模式仍可追问以演练表达）`;
  const raw = (await chatJson(FOLLOWUP_SYSTEM, user)) as {
    action?: string;
    question?: string | null;
    reason?: string;
  };
  if (raw.action === "followup" && raw.question?.trim())
    return { question: raw.question.trim(), reason: raw.reason ?? "" };
  return null;
}

export async function scoreInterview(input: {
  resume: string;
  jd: string;
  company: string;
  mode: InterviewMode;
  turns: InterviewTurn[];
}) {
  const transcript = input.turns
    .map((t) => `${t.role === "interviewer" ? "面试官" : "候选人"}: ${t.text}`)
    .join("\n");
  const user = `公司：${input.company}\n模式：${input.mode}\n\nJD摘要：\n${input.jd.slice(0, 4000)}\n\n简历摘要：\n${input.resume.slice(0, 4000)}\n\n面试记录：\n${transcript}`;
  return chatJson(SCORE_SYSTEM, user);
}

export async function evaluateQuestionBlock(input: {
  resume: string;
  jd: string;
  company: string;
  mode: InterviewMode;
  questionIndex: number;
  category: string;
  kind: string;
  mainQuestion: string;
  mainAnswer: string;
  followupQuestion: string | null;
  followupAnswer: string | null;
}) {
  const blocks = [
    `【主题目】\n${input.mainQuestion}`,
    `【主题目回答】\n${input.mainAnswer.slice(0, 12_000)}`,
  ];
  if (input.followupQuestion) {
    blocks.push(`【追问】\n${input.followupQuestion}`);
    blocks.push(
      `【追问回答】\n${(input.followupAnswer ?? "").slice(0, 8000)}`,
    );
  }
  const user = `公司：${input.company}\n模式：${input.mode}\n题号（从 0 计）：${input.questionIndex}\n板块：${input.category}（kind=${input.kind}）\n\nJD（截断）：\n${input.jd.slice(0, 3500)}\n\n简历（截断）：\n${input.resume.slice(0, 3500)}\n\n${blocks.join("\n\n")}`;
  return chatJson(
    QUESTION_BLOCK_EVAL_SYSTEM,
    user,
  ) as Promise<Record<string, unknown>>;
}

export async function interviewChatReply(input: {
  resume: string;
  jd: string;
  company: string;
  mode: InterviewMode;
  turns: InterviewTurn[];
  questionEvaluations?: QuestionBlockEvaluation[];
  /** 本页已连续多轮时的上文（不含当前这条） */
  priorMessages?: { role: "user" | "assistant"; text: string }[];
  userMessage: string;
}) {
  const transcript = input.turns
    .map((t) => `${t.role === "interviewer" ? "面试官" : "候选人"}: ${t.text}`)
    .join("\n");
  const evalSummary =
    input.questionEvaluations?.length ?
      input.questionEvaluations
        .map((block) => {
          if (block.error) {
            return `题${block.questionIndex} ${block.category}: [详评失败] ${block.error}`;
          }
          const excerpt = JSON.stringify(block.result).slice(0, 1800);
          return `题${block.questionIndex} ${block.category}: ${excerpt}`;
        })
        .join("\n")
    : "（暂无逐题详评）";
  const prior =
    input.priorMessages?.length ?
      input.priorMessages
        .slice(-12)
        .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.text}`)
        .join("\n")
    : "（暂无）";
  const user =
    `公司：${input.company}\n模式：${input.mode}\n\n【JD】\n${input.jd.slice(0, 4000)}\n\n【简历】\n${input.resume.slice(0, 4000)}\n\n【面试记录】\n${transcript.slice(0, 30000)}\n\n【逐题详评摘录】\n${evalSummary.slice(0, 12_000)}\n\n【本页已连续对话】\n${prior.slice(0, 8000)}\n\n【用户当前问题】\n${input.userMessage.slice(0, 8000)}`;
  const raw = (await chatJson(INTERVIEW_CHAT_SYSTEM, user)) as {
    reply?: string;
  };
  const reply = raw.reply?.trim();
  if (!reply) throw new Error("模型未返回 reply");
  return reply;
}
