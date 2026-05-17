require('dotenv').config()

module.exports = {
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL || 'https://opencode.ai/zen/v1',
  port: parseInt(process.env.PORT, 10) || 3000,
}
