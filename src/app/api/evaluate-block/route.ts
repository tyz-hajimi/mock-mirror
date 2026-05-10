import { evaluateQuestionBlock } from "@/lib/deepseek";
import type { InterviewMode } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      resume?: string;
      jd?: string;
      company?: string;
      mode?: InterviewMode;
      questionIndex?: number;
      category?: string;
      kind?: string;
      mainQuestion?: string;
      mainAnswer?: string;
      followupQuestion?: string | null;
      followupAnswer?: string | null;
    };
    const resume = body.resume?.trim() ?? "";
    const jd = body.jd?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const mode = body.mode === "assist" ? "assist" : "realistic";
    const questionIndex =
      typeof body.questionIndex === "number" && body.questionIndex >= 0 ?
        body.questionIndex
      : -1;
    const category = body.category?.trim() ?? "";
    const kind = body.kind ?? "";
    const mainQuestion = body.mainQuestion?.trim() ?? "";
    const mainAnswer = body.mainAnswer?.trim() ?? "";
    const followupQ =
      typeof body.followupQuestion === "string" &&
      body.followupQuestion.trim() ?
        body.followupQuestion.trim()
      : null;
    const followupA =
      typeof body.followupAnswer === "string" ?
        body.followupAnswer.trim()
      : "";

    if (!resume || !jd || questionIndex < 0 || !mainQuestion || !mainAnswer) {
      return NextResponse.json(
        { error: "缺少简历、JD、题号或主题目/回答等字段" },
        { status: 400 },
      );
    }

    const result = await evaluateQuestionBlock({
      resume,
      jd,
      company,
      mode,
      questionIndex,
      category,
      kind,
      mainQuestion,
      mainAnswer,
      followupQuestion: followupQ,
      followupAnswer: followupQ ? followupA || null : null,
    });
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "详评失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
