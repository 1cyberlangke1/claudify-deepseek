# claudify-deepseek

DeepSeek 风格 API → Claude (Anthropic) 风格 API 的代理，将只提供 OpenAI 兼容 `/chat/completions` 接口的 DeepSeek 提供商转换为标准的 Claude Messages API。

## 问题

某些 DeepSeek 兼容提供商只提供 OpenAI 格式的 API（`POST /chat/completions`），而 Claude Code 等工具只认 Anthropic 格式（`POST /v1/messages`）。直接代理会触发：

```
Error 400: The reasoning_content in the thinking mode must be passed back to the API
```

本项目解决了格式转换和 `reasoning_content` 回传问题。

## 使用

```bash
git clone <this-repo>
cd claudify-deepseek
npm install
cp .env.example .env   # 修改配置
npm start
```

然后配置 Claude Code 等工具：

```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=public
```

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `UPSTREAM_BASE_URL` | `https://opencode.ai/zen/v1` | 上游 DeepSeek 提供商地址 |
| `UPSTREAM_MODEL` | `deepseek-v4-flash-free` | 使用的模型名 |
| `UPSTREAM_API_KEY` | `public` | API 密钥 |
| `PORT` | `3000` | 监听端口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug`, `info`, `warn`, `error` |

## 转换说明

行为对齐 [DeepSeek 官方 Anthropic 兼容表](https://api-docs.deepseek.com/guides/anthropic_api)：

- `thinking` block → `reasoning_content`（双向转换）
- `tool_use` / `tool_result` ↔ function calls
- 标 "Ignored" 的字段静默丢弃
- 标 "Not Supported" 的字段（图片/文档等）返回 400

## 协议

MIT © 2026 1cyberlangke1
