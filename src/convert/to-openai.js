const { isEnabled: visionEnabled, describeImage, resetBatch, getBatchStats } = require('../utils/vision')
const logger = require('../utils/logger')

async function applyVision(messages) {
  if (!visionEnabled()) return messages

  // 全量扫描所有 tool_result.content 中的 image
  const images = []
  for (let mi = 0; mi < messages.length; mi++) {
    const c = messages[mi].content
    if (!Array.isArray(c)) continue
    for (let bi = 0; bi < c.length; bi++) {
      if (c[bi]?.type !== 'tool_result') continue
      const nested = Array.isArray(c[bi].content) ? c[bi].content : []
      for (let ni = 0; ni < nested.length; ni++) {
        if (nested[ni]?.type === 'image') {
          images.push({ mi, bi, ni, src: nested[ni].source || {} })
        }
      }
    }
  }

  if (images.length === 0) return messages

  resetBatch()
  const descs = await Promise.all(images.map(i => describeImage(i.src.data, i.src.media_type)))
  const errors = descs.filter(d => d.startsWith('[Vision')).length
  const batch = getBatchStats()
  logger.info('→ vision apply', { found: images.length, cached: batch.hit, fetch: batch.miss, errors })

  const result = messages.map(m => ({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content }))
  for (let idx = 0; idx < images.length; idx++) {
    const img = images[idx]
    if (!Array.isArray(result[img.mi].content)) continue
    const block = result[img.mi].content[img.bi]
    if (block?.type !== 'tool_result') continue
    const inner = Array.isArray(block.content) ? [...block.content] : []
    inner[img.ni] = { type: 'text', text: `[Image] ${descs[idx]}` }
    result[img.mi].content[img.bi] = { ...block, content: inner }
  }
  return result
}

function convertMessages(claudeMsgs) {
  const out = []
  let pendingToolResults = []

  function flushToolResults() {
    for (const tr of pendingToolResults) {
      const content = typeof tr.content === 'string'
        ? tr.content
        : (Array.isArray(tr.content) ? tr.content.map(c => c.text || '').join('') : '')
      out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content })
    }
    pendingToolResults = []
  }

  for (const msg of claudeMsgs) {
    const content = msg.content

    if (typeof content === 'string') {
      flushToolResults()
      out.push({ role: msg.role, content })
      continue
    }

    if (!Array.isArray(content)) {
      out.push({ role: msg.role, content: '' })
      continue
    }

    if (msg.role === 'user') {
      let textParts = []
      for (const block of content) {
        if (block.type === 'text') {
          textParts.push(block.text)
        } else if (block.type === 'tool_result') {
          pendingToolResults.push(block)
        }
      }
      flushToolResults()
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts.join('') })
      }
      continue
    }

    if (msg.role === 'assistant') {
      flushToolResults()
      let contentText = ''
      let reasoningContent = null
      const toolCalls = []

      for (const block of content) {
        if (block.type === 'thinking') {
          reasoningContent = block.thinking
        } else if (block.type === 'text') {
          contentText = block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
            },
          })
        }
      }

      const msgOut = { role: 'assistant', content: contentText }
      if (reasoningContent) msgOut.reasoning_content = reasoningContent
      if (toolCalls.length > 0) msgOut.tool_calls = toolCalls
      out.push(msgOut)
    }
  }

  flushToolResults()
  return out
}

function detectWebSearch(tools) {
  if (!tools) return null
  const ws = tools.find(t => t.type === 'web_search_20250305')
  if (!ws) return null
  return {
    maxUses: ws.max_uses || 3,
    userLocation: ws.user_location || null,
  }
}

function convertTools(tools, webSearchConfig) {
  if (!tools || tools.length === 0) return undefined

  let result = tools
    .filter(t => t.type !== 'web_search_20250305')
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || {},
      },
    }))

  if (webSearchConfig) {
    result.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information. Use this when you need up-to-date facts, news, or information that may not be in your training data.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The search query to look up on the web' } },
          required: ['query'],
        },
      },
    })
  }

  return result.length > 0 ? result : undefined
}

async function convertRequest(body) {
  const messages = []
  const filtered = (body.messages || []).map((m, i) =>
    i > 0 && m.role === 'system' ? { ...m, role: 'user' } : m
  )
  const processed = await applyVision(filtered)
  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }
  messages.push(...convertMessages(processed))

  const wsConfig = detectWebSearch(body.tools)

  const req = { model: body.model, messages }

  if (body.max_tokens !== undefined) req.max_tokens = body.max_tokens

  if (body.thinking && body.thinking.type === 'enabled') {
    req.extra_body = { thinking: { type: 'enabled' } }
  }

  const EFFORT_MAP = { low: 'high', medium: 'high', high: 'high', xhigh: 'max' }
  if (body.output_config && body.output_config.effort) {
    req.reasoning_effort = EFFORT_MAP[body.output_config.effort] || body.output_config.effort
  } else if (body.reasoning_effort) {
    req.reasoning_effort = EFFORT_MAP[body.reasoning_effort] || body.reasoning_effort
  }

  if (body.stop_sequences && body.stop_sequences.length > 0) {
    req.stop = body.stop_sequences
  }

  if (body.temperature !== undefined) req.temperature = body.temperature
  if (body.top_p !== undefined) req.top_p = body.top_p
  if (body.stream !== undefined) req.stream = body.stream

  if (body.tools) req.tools = convertTools(body.tools, wsConfig)

  if (body.tool_choice) {
    if (typeof body.tool_choice === 'object') {
      if (body.tool_choice.type === 'any') {
        req.tool_choice = 'required'
      } else if (body.tool_choice.type === 'tool') {
        req.tool_choice = {
          type: 'function',
          function: { name: body.tool_choice.name },
        }
      } else {
        req.tool_choice = body.tool_choice.type
      }
    } else {
      req.tool_choice = body.tool_choice
    }
  }

  return req
}

module.exports = { convertRequest, detectWebSearch }
