import { ffmpegAvailable, mediaBlobToPcm16kMono } from "@/lib/audio-convert";
import {
  loadVolcAsrAuthFromEnv,
  transcribePcmS16le,
} from "@/lib/volc-bigmodel-asr";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const auth = loadVolcAsrAuthFromEnv();
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "请上传 audio 字段（录音文件）" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());

    if (!auth) {
      const mock =
        process.env.MOCK_ASR_TEXT?.trim() ||
        "【开发模式】未配置火山 ASR 密钥。请在 .env 中设置 VOLC_SPEECH_API_KEY 与 VOLC_SPEECH_RESOURCE_ID，并安装 ffmpeg 以转换录音格式。";
      return NextResponse.json({ text: mock, mock: true });
    }

    if (!ffmpegAvailable()) {
      return NextResponse.json(
        {
          error:
            "服务器未安装 ffmpeg，无法把浏览器录音转为 16k PCM。请安装 ffmpeg 或使用 MOCK_ASR_TEXT。",
        },
        { status: 500 },
      );
    }

    const pcm = mediaBlobToPcm16kMono(buf, "webm");
    const text = await transcribePcmS16le(pcm, auth, { chunkMs: 120 });
    return NextResponse.json({ text, mock: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "语音识别失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
