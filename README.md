# 面镜 MockMirror

基于简历与岗位 **JD** 的大厂风格 **模拟面试**：生成大纲 → **语音口述** → 追问与记录 → **报告与复盘**。口述内容落为文字，便于复盘与后续「问 AI」延续对话。

## 功能概览

- **首页**：填写目标公司、JD、简历；选择拟真 / 辅助模式；生成大纲并开始面试。
- **面试页**：语音作答（对接火山流式 ASR，可配置占位文案）；分段转写与追问流程。
- **报告页**：结构化复盘与历史相关内容展示。
- **仅问 AI**：需先有面试记录或从历史打开后继续对话。

产品思路与评审说明见仓库内 [`productmemo.txt`](./productmemo.txt)。

## 环境要求

- **Node.js** 20+（与当前工程依赖一致即可）
- **npm**（或兼容的包管理器）

## 配置

复制环境变量模板并填写密钥：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek OpenAI 兼容接口，用于大纲、追问、总评、对话等 |
| `VOLC_SPEECH_API_KEY` / `VOLC_SPEECH_RESOURCE_ID` | 火山引擎大模型流式语音识别（详见 `.env.example` 注释） |

未配置火山密钥时，可按 `.env.example` 使用 `MOCK_ASR_TEXT` 等占位行为（以实际代码为准）。

## 本地开发

```bash
npm install
npm run dev
```

浏览器访问 <http://localhost:3000>。

## 生产构建与运行

```bash
npm run build
npm run start
```

默认监听 **`0.0.0.0:3000`**，便于内网穿透或云主机公网访问（仍需安全组/防火墙放行对应端口）。

## 技术栈

- **Next.js** 16（App Router）+ **React** 19 + **TypeScript**
- **Tailwind CSS** 4
- 服务端 API：`/api/outline`、`/api/transcribe`、`/api/followup`、`/api/score`、`/api/evaluate-block`、`/api/interview-chat` 等

## 仓库

<https://github.com/tyz-hajimi/mock-mirror>

## 许可

未包含开源许可证文件时，默认保留所有权利；如需开源请自行补充 `LICENSE`。
