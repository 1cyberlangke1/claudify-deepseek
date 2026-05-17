require('dotenv').config()

module.exports = {
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL || 'https://opencode.ai/zen/v1',
  upstreamModel: process.env.UPSTREAM_MODEL || 'deepseek-v4-flash-free',
  upstreamApiKey: process.env.UPSTREAM_API_KEY || 'public',
  port: parseInt(process.env.PORT, 10) || 3000,
}
