const FINISH_REASON_MAP = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'content_filter',
  insufficient_system_resource: 'max_tokens',
}

function convertNonStreaming(body) {
  const choice = body.choices && body.choices[0]
  if (!choice) {
    return { id: body.id || '', type: 'message', role: 'assistant', content: [], model: body.model || '', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }
  }

  const msg = choice.message || {}
  const contentBlocks = []

  if (msg.reasoning_content) {
    contentBlocks.push({
      type: 'thinking',
      thinking: msg.reasoning_content,
      signature: '',
    })
  }

  if (msg.content) {
    contentBlocks.push({
      type: 'text',
      text: msg.content,
    })
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let input
      try { input = JSON.parse(tc.function.arguments) } catch { input = tc.function.arguments }
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      })
    }
  }

  const usage = body.usage || {}
  return {
    id: body.id || '',
    type: 'message',
    role: 'assistant',
    content: contentBlocks,
    model: body.model || '',
    stop_reason: FINISH_REASON_MAP[choice.finish_reason] || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      ...(usage.prompt_cache_hit_tokens != null && { cache_read_input_tokens: usage.prompt_cache_hit_tokens }),
      ...(usage.prompt_cache_miss_tokens != null && { cache_creation_input_tokens: usage.prompt_cache_miss_tokens }),
    },
  }
}

module.exports = { convertNonStreaming, FINISH_REASON_MAP }
