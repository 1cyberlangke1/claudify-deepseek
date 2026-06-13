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

function convertRequest(body) {
  const messages = []
  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }
  messages.push(...convertMessages(body.messages || []))

  const req = {
    model: body.model,
    messages,
  }

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

  if (body.tools && body.tools.length > 0) {
    req.tools = body.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || {},
      },
    }))
  }

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

module.exports = { convertRequest }
