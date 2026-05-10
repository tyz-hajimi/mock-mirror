import { scoreInterview } from "@/lib/deepseek";
import type { InterviewMode, InterviewTurn } from "@/lib/types";
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
    };
    const resume = body.resume?.trim() ?? "";
    const jd = body.jd?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const mode = body.mode === "assist" ? "assist" : "realistic";
    const turns = body.turns ?? [];
    if (!resume || !jd || turns.length === 0) {
      return NextResponse.json(
        { error: "缺少简历、JD 或面试记录" },
        { status: 400 },
      );
    }
    const report = await scoreInterview({
      resume,
      jd,
      company,
      mode,
      turns,
    });
    return NextResponse.json({ report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "评分失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
