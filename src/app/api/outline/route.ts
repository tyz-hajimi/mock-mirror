import { generateOutline } from "@/lib/deepseek";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      resume?: string;
      jd?: string;
      company?: string;
    };
    const resume = body.resume?.trim() ?? "";
    const jd = body.jd?.trim() ?? "";
    const company = body.company?.trim() ?? "未填写";
    if (!resume || !jd) {
      return NextResponse.json(
        { error: "请填写简历与 JD" },
        { status: 400 },
      );
    }
    const outline = await generateOutline({ resume, jd, company });
    return NextResponse.json({ outline });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成大纲失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
