require('dotenv').config()

module.exports = {
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL || 'https://opencode.ai/zen/v1',
  upstreamModel: process.env.UPSTREAM_MODEL || 'deepseek-v4-flash-free',
  // 不再需要 UPSTREAM_API_KEY，直接从下游请求的 x-api-key 转发
  port: parseInt(process.env.PORT, 10) || 3000,
}
