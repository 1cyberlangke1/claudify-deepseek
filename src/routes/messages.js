const config = require('../config')
const { convertRequest } = require('../convert/to-openai')
const { convertNonStreaming } = require('../convert/to-anthropic')
const { createStreamConverter } = require('../stream/convert-stream')
const { getApiKey } = require('../utils/helpers')
const logger = require('../utils/logger')

async function handleMessages(req, res) {
  const body = req.body

  const isStream = body.stream === true
  logger.info('← POST /v1/messages', {
    stream: isStream,
    msg_count: body.messages?.length || 0,
    has_thinking: !!body.thinking,
    has_tools: !!(body.tools?.length),
  })

  const apiKey = getApiKey(req)
  if (!apiKey) {
    logger.warn('auth missing', { headers: Object.keys(req.headers).filter(h => h.startsWith('x-') || h.startsWith('anthropic') || h === 'authorization') })
    return res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'x-api-key or Authorization: Bearer header required' },
    })
  }

  const openaiReq = convertRequest(body)
  if (isStream) {
    openaiReq.stream = true
    openaiReq.stream_options = { include_usage: true }
  }

  const start = Date.now()
  let upstreamStatus
  try {
    const upstreamRes = await fetch(`${config.upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(openaiReq),
    })
    upstreamStatus = upstreamRes.status

    if (!upstreamRes.ok) {
      let errBody
      try { errBody = await upstreamRes.json() } catch { errBody = null }
      logger.warn('← upstream error', { status: upstreamRes.status, ms: Date.now() - start })
      return res.status(upstreamRes.status).json(errBody)
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      const converter = createStreamConverter(upstreamRes, res)
      await converter.pipe()
      res.end()
      logger.info('→ stream complete', { ms: Date.now() - start })
    } else {
      const data = await upstreamRes.json()
      const claudeRes = convertNonStreaming(data)
      res.json(claudeRes)
      logger.info('→ response sent', {
        ms: Date.now() - start,
        stop_reason: claudeRes.stop_reason,
        blocks: claudeRes.content.length,
        in_tokens: claudeRes.usage.input_tokens,
        out_tokens: claudeRes.usage.output_tokens,
      })
    }
  } catch (err) {
    logger.error('request failed', { ms: Date.now() - start, error: err.message })
    if (!res.headersSent) {
      res.status(502).json({
        type: 'error',
        error: {
          type: 'upstream_error',
          message: err.message || 'Failed to reach upstream',
        },
      })
    }
  }
}

module.exports = { handleMessages }
