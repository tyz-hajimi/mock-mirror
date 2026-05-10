import { NextResponse } from "next/server";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

function getKey() {
  const k = process.env.DEEPSEEK_API_KEY;
  if (!k) throw new Error("缺少环境变量 DEEPSEEK_API_KEY");
  return k;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question?: string;
      resume?: string;
    };
    const question = body.question?.trim() ?? "";
    const resume = body.resume?.trim()?.slice(0, 3000) ?? "";
    if (!question) {
      return NextResponse.json({ error: "缺少题目" }, { status: 400 });
    }
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getKey()}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "你是面试教练。针对题目给出 3~5 条极简中文要点（短语或短句），帮助候选人组织口述。不要写标准答案长文，不要 Markdown。每行一条。",
          },
          {
            role: "user",
            content: `题目：${question}\n\n简历节选（可结合）：\n${resume || "无"}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json(
        { error: `DeepSeek ${res.status}: ${t.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const hints = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ hints });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成要点失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
