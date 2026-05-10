import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/** 需要系统已安装 ffmpeg。将浏览器 WebM/Opus 等转成 16k 单声道 s16le PCM */
export function mediaBlobToPcm16kMono(input: Buffer, ext = "webm"): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-asr-"));
  try {
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, "out.pcm");
    fs.writeFileSync(inPath, input);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        outPath,
      ],
      { stdio: "pipe" },
    );
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function ffmpegAvailable() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
