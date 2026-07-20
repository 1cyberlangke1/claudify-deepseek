const config = require('../config')
const { convertRequest, detectWebSearch } = require('../convert/to-openai')
const { convertNonStreaming } = require('../convert/to-anthropic')
const { createStreamConverter } = require('../stream/convert-stream')
const { getApiKey, estimatePromptTokens } = require('../utils/helpers')
const { webSearch } = require('../utils/search')
const logger = require('../utils/logger')

async function collectUpstream(openaiReq, apiKey) {
  const res = await fetch(`${config.upstreamBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(openaiReq),
  })
  if (!res.ok) {
    let errBody
    try { errBody = await res.json() } catch { errBody = null }
    const err = new Error('Upstream returned ' + res.status)
    err.status = res.status
    err.body = errBody
    throw err
  }
  return res.json()
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function streamWebSearchResponse(res, contentBlocks, model, usage) {
  sendSSE(res, 'message_start', {
    type: 'message_start',
    message: {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: usage?.prompt_tokens || 0, output_tokens: 0 },
    },
  })

  for (let i = 0; i < contentBlocks.length; i++) {
    const block = contentBlocks[i]

    if (block.type === 'text') {
      sendSSE(res, 'content_block_start', {
        type: 'content_block_start', index: i,
        content_block: { type: 'text', text: '' },
      })
      const chunkSize = 50
      for (let j = 0; j < block.text.length; j += chunkSize) {
        sendSSE(res, 'content_block_delta', {
          type: 'content_block_delta', index: i,
          delta: { type: 'text_delta', text: block.text.substring(j, j + chunkSize) },
        })
      }
      sendSSE(res, 'content_block_stop', { type: 'content_block_stop', index: i })

    } else if (block.type === 'server_tool_use') {
      sendSSE(res, 'content_block_start', {
        type: 'content_block_start', index: i,
        content_block: { type: 'server_tool_use', id: block.id, name: block.name, input: {} },
      })
      sendSSE(res, 'content_block_delta', {
        type: 'content_block_delta', index: i,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      })
      sendSSE(res, 'content_block_stop', { type: 'content_block_stop', index: i })

    } else if (block.type === 'web_search_tool_result') {
      sendSSE(res, 'content_block_start', {
        type: 'content_block_start', index: i,
        content_block: block,
      })
      sendSSE(res, 'content_block_stop', { type: 'content_block_stop', index: i })

    } else if (block.type === 'tool_use') {
      sendSSE(res, 'content_block_start', {
        type: 'content_block_start', index: i,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      })
      sendSSE(res, 'content_block_delta', {
        type: 'content_block_delta', index: i,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      })
      sendSSE(res, 'content_block_stop', { type: 'content_block_stop', index: i })
    }
  }

  const stopReason = contentBlocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'
  sendSSE(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: usage?.completion_tokens || 0 },
  })
  sendSSE(res, 'message_stop', { type: 'message_stop' })
  res.end()
}

async function handleWebSearch(openaiReq, apiKey, wsConfig) {
  const contentBlocks = []
  let searchCount = 0
  let currentReq = { ...openaiReq }
  let lastResponse = null
  const maxSearches = wsConfig.maxUses || 3

  for (let iteration = 0; iteration < maxSearches + 1; iteration++) {
    const response = await collectUpstream(currentReq, apiKey)
    lastResponse = response
    const choice = response.choices?.[0]
    if (!choice) break

    const msg = choice.message || {}
    const webSearchCall = (msg.tool_calls || []).find(tc => tc.function?.name === 'web_search')

    if (!webSearchCall || searchCount >= maxSearches) {
      if (msg.content) contentBlocks.push({ type: 'text', text: msg.content })
      for (const tc of (msg.tool_calls || [])) {
        let input
        try { input = JSON.parse(tc.function.arguments) } catch { input = tc.function.arguments }
        contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
      }
      break
    }

    searchCount++
    let searchQuery = ''
    try { searchQuery = JSON.parse(webSearchCall.function.arguments)?.query || '' } catch { searchQuery = webSearchCall.function.arguments || '' }

    if (msg.content) contentBlocks.push({ type: 'text', text: msg.content })

    const toolUseId = `stoolu_${Date.now()}_${searchCount}`
    contentBlocks.push({
      type: 'server_tool_use', id: toolUseId, name: 'web_search',
      input: { query: searchQuery },
    })

    const searchResult = await webSearch(searchQuery)
    contentBlocks.push({
      type: 'web_search_tool_result', tool_use_id: toolUseId,
      content: searchResult.results,
    })

    const followUpMessages = [
      ...currentReq.messages,
      {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: [webSearchCall],
      },
      {
        role: 'tool',
        tool_call_id: webSearchCall.id,
        content: searchResult.results.map(r => `Title: ${r.title}\nURL: ${r.url}`).join('\n\n'),
      },
    ]
    currentReq = { ...openaiReq, messages: followUpMessages }
  }

  return { contentBlocks, lastResponse, searchCount }
}

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

  const wsConfig = detectWebSearch(body.tools)
  const openaiReq = convertRequest(body)

  if (wsConfig) {
    logger.info('→ web_search path', { max_uses: wsConfig.maxUses })
    const start = Date.now()
    try {
      openaiReq.stream = false
      if (openaiReq.stream_options) delete openaiReq.stream_options

      const { contentBlocks, lastResponse, searchCount } = await handleWebSearch(openaiReq, apiKey, wsConfig)
      const usage = (lastResponse && lastResponse.usage) || {}

      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        streamWebSearchResponse(res, contentBlocks, body.model || '', usage)
      } else {
        res.json({
          id: lastResponse?.id || `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: contentBlocks,
          model: body.model || '',
          stop_reason: contentBlocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0 },
        })
      }
      logger.info('→ web_search complete', { ms: Date.now() - start, searches: searchCount, blocks: contentBlocks.length })
    } catch (err) {
      logger.error('→ web_search failed', { error: err.message })
      if (!res.headersSent) {
        res.status(502).json({
          type: 'error',
          error: { type: 'upstream_error', message: err.message || 'Web search failed' },
        })
      }
    }
    return
  }

  if (isStream) {
    openaiReq.stream = true
    openaiReq.stream_options = { include_usage: true }
  }

  const start = Date.now()
  try {
    logger.debug('→ upstream POST', { url: `${config.upstreamBaseUrl}/chat/completions` })
    const upstreamRes = await fetch(`${config.upstreamBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(openaiReq),
    })

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

      const estimatedPromptTokens = estimatePromptTokens(body)
      const converter = createStreamConverter(upstreamRes, res, estimatedPromptTokens)
      const usage = await converter.pipe()
      res.end()
      const u = usage || {}
      logger.info('→ stream complete', {
        ms: Date.now() - start,
        in_tokens: u.prompt_tokens || 0,
        out_tokens: u.completion_tokens || 0,
      })
    } else {
      const data = await upstreamRes.json()
      const claudeRes = convertNonStreaming(data)
      res.json(claudeRes)
      const u = data.usage || {}
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
        error: { type: 'upstream_error', message: err.message || 'Failed to reach upstream' },
      })
    }
  }
}

module.exports = { handleMessages }
