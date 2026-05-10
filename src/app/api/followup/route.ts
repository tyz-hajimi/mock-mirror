import { maybeFollowup } from "@/lib/deepseek";
import { NextResponse } from "next/server";
import type { InterviewMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mainQuestion?: string;
      answerTranscript?: string;
      mode?: InterviewMode;
    };
    const mainQuestion = body.mainQuestion?.trim() ?? "";
    const answerTranscript = body.answerTranscript?.trim() ?? "";
    const mode = body.mode === "assist" ? "assist" : "realistic";
    if (!mainQuestion || !answerTranscript) {
      return NextResponse.json(
        { error: "缺少题目或转写文本" },
        { status: 400 },
      );
    }
    const follow = await maybeFollowup({
      mainQuestion,
      answerTranscript,
      mode,
    });
    return NextResponse.json({ followup: follow });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "追问生成失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
