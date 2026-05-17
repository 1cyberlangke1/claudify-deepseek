const config = require('../config')
const { convertRequest } = require('../convert/to-openai')
const { convertNonStreaming } = require('../convert/to-anthropic')
const { createStreamConverter } = require('../stream/convert-stream')
const { mapUpstreamError } = require('../utils/errors')
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
        'Authorization': `Bearer ${config.upstreamApiKey}`,
      },
      body: JSON.stringify(openaiReq),
    })
    upstreamStatus = upstreamRes.status

    if (!upstreamRes.ok) {
      let errBody
      try { errBody = await upstreamRes.json() } catch { errBody = null }
      const err = mapUpstreamError(upstreamRes.status, errBody)
      logger.warn('← upstream error', { status: upstreamRes.status, ms: Date.now() - start })
      return res.status(err.statusCode).json(err.toAnthropic())
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
