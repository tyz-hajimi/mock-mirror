import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import zlib from "zlib";
import WebSocket from "ws";

const ASR_URL =
  "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";

/** 协议 v1，header 固定 4 字节（文档：header size = 1 表示 4 字节） */
function buildHeader(
  msgType: number,
  flags: number,
  serialization: number,
  compression: number,
) {
  const b0 = (0x1 << 4) | 0x1;
  const b1 = (msgType << 4) | (flags & 0xf);
  const b2 = (serialization << 4) | (compression & 0xf);
  return Buffer.from([b0, b1, b2, 0x00]);
}

function encodeFullClientRequest(payloadJson: object) {
  const payload = zlib.gzipSync(Buffer.from(JSON.stringify(payloadJson), "utf8"));
  const header = buildHeader(0x1, 0x0, 0x1, 0x1);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, size, payload]);
}

/** 中间音频包：带正序序号。最后一包：flag=0b0010，无序号（文档流式输入负包） */
function encodeAudioChunk(pcmGzip: Buffer, seq: number, isLast: boolean) {
  const flags = isLast ? 0x2 : 0x1;
  const header = buildHeader(0x2, flags, 0x0, 0x1);
  const chunks: Buffer[] = [header];
  if (!isLast) {
    const sb = Buffer.alloc(4);
    sb.writeUInt32BE(seq >>> 0, 0);
    chunks.push(sb);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(pcmGzip.length, 0);
  chunks.push(size, pcmGzip);
  return Buffer.concat(chunks);
}

type AsrAuth = {
  /** 新版控制台 */
  apiKey?: string;
  /** 旧版控制台 */
  appKey?: string;
  accessKey?: string;
  resourceId: string;
};

function collectWsHeaders(auth: AsrAuth) {
  const requestId = randomUUID();
  const connectId = randomUUID();
  const headers: Record<string, string> = {
    "X-Api-Resource-Id": auth.resourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
    "X-Api-Connect-Id": connectId,
  };
  if (auth.apiKey) {
    headers["X-Api-Key"] = auth.apiKey;
  } else if (auth.appKey && auth.accessKey) {
    headers["X-Api-App-Key"] = auth.appKey;
    headers["X-Api-Access-Key"] = auth.accessKey;
  } else {
    throw new Error("需要配置 VOLC_SPEECH_API_KEY 或 VOLC_SPEECH_APP_KEY+VOLC_SPEECH_ACCESS_KEY");
  }
  return headers;
}

function readHttpMessageBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", () => resolve(""));
  });
}

/** 将 ws 握手非 101 的响应解析为可读错误（便于排查 403） */
async function explainWsHandshakeFailure(
  statusCode: number | undefined,
  res: IncomingMessage,
) {
  const logId =
    res.headers["x-tt-logid"] ??
    res.headers["X-Tt-Logid"] ??
    res.headers["X-Tt-LOGID"];
  const body = (await readHttpMessageBody(res)).trim().slice(0, 400);
  const base = `ASR 建连被拒绝（HTTP ${statusCode ?? "?"}）`;
  const tail =
    "常见原因：API Key 错误/过期、Resource ID 与购买的计费类型不一致（小时版 volc.bigasr.*.duration vs 并发版 *.concurrent）、未开通豆包流式语音识别或余额不足。";
  return [
    base,
    logId ? `x-tt-logid: ${logId}` : null,
    body ? `响应体: ${body}` : null,
    tail,
  ]
    .filter(Boolean)
    .join("。 ");
}

function parseServerBinary(buf: Buffer): {
  json?: Record<string, unknown>;
  error?: string;
} {
  if (buf.length < 4) return {};
  const headerSizeUnit = buf[0] & 0x0f;
  const headerSize = headerSizeUnit * 4;
  const msgType = buf[1] >> 4;
  const flags = buf[1] & 0x0f;

  let off = headerSize;
  if (msgType === 0xf) {
    const code = buf.readUInt32BE(off);
    off += 4;
    const msgLen = buf.readUInt32BE(off);
    off += 4;
    const msg = buf.subarray(off, off + msgLen).toString("utf8");
    return { error: `ASR ${code}: ${msg}` };
  }

  if (msgType !== 0x9) {
    return { error: `未知消息类型 0x${msgType.toString(16)}` };
  }

  if (flags === 0x1 || flags === 0x3) {
    off += 4;
  }
  if (off + 4 > buf.length) return {};
  const payloadSize = buf.readUInt32BE(off);
  off += 4;
  const payload = buf.subarray(off, off + payloadSize);
  if (payload.length === 0) return {};
  let jsonBuf: Buffer;
  try {
    jsonBuf = zlib.gunzipSync(payload);
  } catch {
    jsonBuf = payload;
  }
  try {
    return { json: JSON.parse(jsonBuf.toString("utf8")) as Record<string, unknown> };
  } catch {
    return { error: `解析识别 JSON 失败：${jsonBuf.toString("utf8").slice(0, 200)}` };
  }
}

function getResultText(json: Record<string, unknown> | undefined) {
  if (!json) return "";
  const result = json.result as { text?: string } | undefined;
  return (result?.text ?? "").trim();
}

export type TranscribePcmOptions = {
  sampleRate?: number;
  /** 每包时长约 ms，建议 100~200 */
  chunkMs?: number;
  timeoutMs?: number;
};

/**
 * 将 16bit LE 单声道 PCM 走「流式输入」协议发包，返回最终文本（多包结果取最后一次非空 text）
 */
export async function transcribePcmS16le(
  pcm: Buffer,
  auth: AsrAuth,
  options: TranscribePcmOptions = {},
) {
  const sampleRate = options.sampleRate ?? 16000;
  const chunkMs = options.chunkMs ?? 120;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const bytesPerMs = (sampleRate * 2) / 1000;
  const chunkBytes = Math.max(320, Math.floor(bytesPerMs * chunkMs));

  const payloadJson = {
    user: { uid: "mock-mirror-web" },
    audio: {
      format: "pcm",
      codec: "raw",
      rate: sampleRate,
      bits: 16,
      channel: 1,
      language: "zh-CN",
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      result_type: "full",
    },
  };

  const headers = collectWsHeaders(auth);
  const ws = new WebSocket(ASR_URL, { headers });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ASR 建连超时")), 15_000);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      fn();
    };
    ws.once("open", () => finish(resolve));
    ws.once("unexpected-response", (_req, res) => {
      void (async () => {
        try {
          const msg = await explainWsHandshakeFailure(res.statusCode, res);
          finish(() => reject(new Error(msg)));
        } catch {
          finish(() =>
            reject(
              new Error(
                `ASR 建连被拒绝（HTTP ${res.statusCode ?? "?"}），请检查密钥与 Resource ID`,
              ),
            ),
          );
        }
      })();
    });
    ws.once("error", (e) => {
      finish(() => {
        const m = e instanceof Error ? e.message : String(e);
        if (m.includes("403")) {
          reject(
            new Error(
              `${m}。多为火山鉴权失败：请核对 VOLC_SPEECH_API_KEY（或 AppKey+AccessKey）、VOLC_SPEECH_RESOURCE_ID（duration/concurrent 与控制台一致），并确认服务已开通且有余额。`,
            ),
          );
        } else reject(e);
      });
    });
  });

  let lastText = "";
  let settled = false;
  const errors: string[] = [];

  let releaseFirstServerFrame: (() => void) | null = null;
  const firstServerFramePromise = new Promise<void>((resolve) => {
    releaseFirstServerFrame = resolve;
  });

  const done = new Promise<string>((resolve, reject) => {
    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error("ASR 识别超时"));
      });
    }, timeoutMs);

    ws.on("message", (data) => {
      releaseFirstServerFrame?.();
      releaseFirstServerFrame = null;

      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const { json, error } = parseServerBinary(buf);
      if (error) errors.push(error);
      const t = getResultText(json);
      if (t) lastText = t;
      const flag = buf.length >= 2 ? buf[1] & 0x0f : 0;
      if (flag === 0x3) {
        clearTimeout(timer);
        finish(() => {
          settled = true;
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(lastText);
        });
      }
    });

    ws.on("close", () => {
      clearTimeout(timer);
      finish(() => {
        if (!settled) {
          settled = true;
          if (lastText) resolve(lastText);
          else reject(new Error(errors.join("；") || "连接已关闭且无识别结果"));
        }
      });
    });

    ws.on("error", (e) => {
      clearTimeout(timer);
      finish(() => reject(e));
    });
  });

  ws.send(encodeFullClientRequest(payloadJson));

  await Promise.race([
    firstServerFramePromise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("ASR 等待 full client 首包响应超时")),
        15_000,
      ),
    ),
  ]);

  /** 服务端在 full client 后会递增序号；首帧音频须从 2 开始，否则会报 autoAssignedSequence mismatch */
  let seq = 2;

  let offset = 0;
  while (offset < pcm.length) {
    const end = Math.min(offset + chunkBytes, pcm.length);
    const slice = pcm.subarray(offset, end);
    const gz = zlib.gzipSync(slice);
    const isLast = end >= pcm.length;
    ws.send(encodeAudioChunk(gz, seq, isLast));
    if (!isLast) seq += 1;
    offset = end;
    await new Promise((r) => setTimeout(r, chunkMs));
  }

  if (pcm.length === 0) {
    const gz = zlib.gzipSync(Buffer.alloc(0));
    ws.send(encodeAudioChunk(gz, seq, true));
  }

  try {
    return await done;
  } finally {
    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
  }
}

export function loadVolcAsrAuthFromEnv(): AsrAuth | null {
  const resourceId =
    process.env.VOLC_SPEECH_RESOURCE_ID ?? "volc.bigasr.sauc.duration";
  const apiKey = process.env.VOLC_SPEECH_API_KEY;
  const appKey = process.env.VOLC_SPEECH_APP_KEY;
  const accessKey = process.env.VOLC_SPEECH_ACCESS_KEY;
  if (apiKey) return { apiKey, resourceId };
  if (appKey && accessKey) return { appKey, accessKey, resourceId };
  return null;
}
