import { FOLLOWUP_SYSTEM, OUTLINE_SYSTEM, SCORE_SYSTEM } from "./prompts";
import type { InterviewMode, InterviewOutline, InterviewTurn } from "./types";

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
