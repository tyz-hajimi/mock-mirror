import { interviewChatReply } from "@/lib/deepseek";
import type {
  InterviewMode,
  InterviewTurn,
  QuestionBlockEvaluation,
} from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      resume?: string;
      jd?: string;
      company?: string;
      mode?: InterviewMode;
      turns?: InterviewTurn[];
      questionEvaluations?: QuestionBlockEvaluation[];
      priorMessages?: { role: string; text: string }[];
      userMessage?: string;
    };
    const resume = body.resume?.trim() ?? "";
    const jd = body.jd?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const mode = body.mode === "assist" ? "assist" : "realistic";
    const turns = body.turns ?? [];
    const userMessage = body.userMessage?.trim() ?? "";
    if (!resume || !jd || turns.length === 0 || !userMessage) {
      return NextResponse.json(
        { error: "缺少简历、JD、面试记录或用户问题" },
        { status: 400 },
      );
    }
    const reply = await interviewChatReply({
      resume,
      jd,
      company,
      mode,
      turns,
      questionEvaluations: body.questionEvaluations,
      priorMessages: body.priorMessages?.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        text: String(m.text ?? ""),
      })),
      userMessage,
    });
    return NextResponse.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "对话失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
