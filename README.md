# claudify-deepseek

DeepSeek 风格 API → Claude (Anthropic) 风格 API 的代理，将只提供 OpenAI 兼容 `/chat/completions` 接口的 DeepSeek 提供商转换为标准的 Claude Messages API。

## 问题

某些 DeepSeek 兼容提供商 （比如 OpenCode）只提供 OpenAI 格式的 API（`POST /chat/completions`），而 Claude Code 等工具只认 Anthropic 格式（`POST /v1/messages`）。直接代理会触发：

```
Error 400: The reasoning_content in the thinking mode must be passed back to the API
```

本项目解决了格式转换和 `reasoning_content` 回传问题。

## 使用

```bash
git clone <this-repo>
cd claudify-deepseek
npm install
cp .env.example .env
npm start
```

Windows 用户也可以用静默脚本（无终端窗口）：
- `start.bat` — 后台启动（自动检测是否已在运行）
- `stop.bat` — 停止代理

然后配置 Claude Code：

```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=<你的 upstream API key>
```

model 名直接透传，Claude Code 发什么 upstream 就收什么。如果你的上游是 DeepSeek 系，可以指定：

```bash
# Claude Code 发这个模型名，代理原样转发给 upstream
export ANTHROPIC_MODEL=deepseek-v4-flash-free
```

`ANTHROPIC_API_KEY` 会通过 `Authorization: Bearer` 头自动透传给 upstream，无需额外配置。

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `UPSTREAM_BASE_URL` | `https://opencode.ai/zen/v1` | 上游 DeepSeek 提供商地址 |
| `PORT` | `4000` | 监听端口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug`, `info`, `warn`, `error` |
| `LOG_DIR` | `logs` | 日志文件目录 |
| `LOG_FILE_MAX_SIZE` | `10485760` | 单日志上限（bytes） |
| `LOG_FILE_MAX_FILES` | `5` | 保留轮转文件数 |
| `LOG_FILE_ENABLED` | `true` | 是否写文件日志 |
| `EXA_API_KEY` | — | Exa 搜索 API key（可选，免费 tier 无需 key） |

API key 从下游请求的 `x-api-key` 或 `Authorization: Bearer` 头自动透传；model 直接从下游请求体透传。

## Web 搜索

支持 Claude Code 内置的 `web_search_20250305` 工具，使用 **Exa** 搜索提供实时搜索结果。

- 无需额外配置，免费 tier 即开即用
- 设置 `EXA_API_KEY` 可解除免费 rate limit
- 搜索在代理侧执行，上游 DeepSeek 无需支持搜索

## 转换说明

行为对齐 [DeepSeek 官方 Anthropic 兼容表](https://api-docs.deepseek.com/guides/anthropic_api)：

- `thinking` block → `reasoning_content`（双向转换）
- `output_config.effort` / `reasoning_effort` → `low/medium/high` 映射为 `high`，`xhigh` 映射为 `max`
- `tool_use` / `tool_result` ↔ function calls
- `web_search_20250305`（Anthropic 内置工具）→ 代理侧搜索，不转发上游
- 标 "Ignored" 的字段静默丢弃（如 `thinking.budget_tokens`）
- 标 "Not Supported" 的字段（图片/文档等）返回 400

## 协议

MIT © 2026 1cyberlangke1
