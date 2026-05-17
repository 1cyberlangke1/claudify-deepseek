const { FINISH_REASON_MAP } = require('../convert/to-anthropic')

function createStreamConverter(upstreamResponse, res, estimatedPromptTokens) {
  const reader = upstreamResponse.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let blockIndex = -1
  let currentBlockType = null
  let messageId = ''
  let model = ''
  let hasStarted = false
  let startedToolIndices = new Set()
  let toolIndexToBlockIndex = {}
  let toolBlockIndicesInOrder = []
  let finalUsage = null
  const promptTokens = estimatedPromptTokens || 0

  function sendSSE(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  function closeCurrentBlock() {
    if (currentBlockType) {
      if (currentBlockType === 'tool_use') {
        for (const idx of toolBlockIndicesInOrder) {
          sendSSE('content_block_stop', { type: 'content_block_stop', index: idx })
        }
        toolBlockIndicesInOrder = []
        toolIndexToBlockIndex = {}
        startedToolIndices = new Set()
      } else {
        sendSSE('content_block_stop', { type: 'content_block_stop', index: blockIndex })
      }
      currentBlockType = null
    }
  }

  function startBlock(type, blockPayload) {
    blockIndex++
    currentBlockType = type
    sendSSE('content_block_start', {
      type: 'content_block_start',
      index: blockIndex,
      content_block: blockPayload,
    })
  }

  function processChunk(chunk) {
    const choice = chunk.choices && chunk.choices[0]
    if (!choice) return

    const delta = choice.delta || {}
    const finishReason = choice.finish_reason || null
    const usage = chunk.usage || null

    if (!messageId && chunk.id) messageId = chunk.id
    if (!model && chunk.model) model = chunk.model

    if (!hasStarted) {
      sendSSE('message_start', {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: promptTokens, output_tokens: 0 },
        },
      })
      hasStarted = true
    }

    if (delta.reasoning_content) {
      if (currentBlockType !== 'thinking') {
        closeCurrentBlock()
        startBlock('thinking', { type: 'thinking', thinking: '', signature: '' })
      }
      sendSSE('content_block_delta', {
        type: 'content_block_delta',
        index: blockIndex,
        delta: { type: 'thinking_delta', thinking: delta.reasoning_content },
      })
      return
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!startedToolIndices.has(tc.index)) {
          startedToolIndices.add(tc.index)
          if (currentBlockType !== 'tool_use') {
            closeCurrentBlock()
            currentBlockType = 'tool_use'
          }
          blockIndex++
          toolIndexToBlockIndex[tc.index] = blockIndex
          toolBlockIndicesInOrder.push(blockIndex)
          let input = {}
          if (tc.function && tc.function.arguments) {
            try { input = JSON.parse(tc.function.arguments) } catch { input = tc.function.arguments }
          }
          sendSSE('content_block_start', {
            type: 'content_block_start',
            index: blockIndex,
            content_block: {
              type: 'tool_use',
              id: tc.id || '',
              name: tc.function ? tc.function.name : '',
              input,
            },
          })
        } else {
          if (tc.function && tc.function.arguments) {
            const idx = toolIndexToBlockIndex[tc.index]
            if (idx !== undefined) {
              sendSSE('content_block_delta', {
                type: 'content_block_delta',
                index: idx,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              })
            }
          }
        }
      }
      return
    }

    if (delta.content) {
      if (currentBlockType !== 'text') {
        closeCurrentBlock()
        startBlock('text', { type: 'text', text: '' })
      }
      sendSSE('content_block_delta', {
        type: 'content_block_delta',
        index: blockIndex,
        delta: { type: 'text_delta', text: delta.content },
      })
      return
    }

    if (finishReason || (usage && !delta.reasoning_content && !delta.content && !delta.tool_calls)) {
      closeCurrentBlock()
      finalUsage = usage

      const stopReason = FINISH_REASON_MAP[finishReason] || 'end_turn'
      sendSSE('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: {
          input_tokens: usage ? (usage.prompt_tokens || 0) : 0,
          output_tokens: usage ? (usage.completion_tokens || 0) : 0,
        },
      })
      sendSSE('message_stop', { type: 'message_stop' })
    }
  }

  async function pipe() {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        buffer += text
        const parts = buffer.split('\n')
        buffer = parts.pop() || ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6)
          if (payload === '[DONE]') continue
          try {
            processChunk(JSON.parse(payload))
          } catch {
            // skip malformed JSON
          }
        }
      }
      if (buffer.trim().startsWith('data: ')) {
        const payload = buffer.trim().slice(6)
        if (payload !== '[DONE]') {
          try {
            processChunk(JSON.parse(payload))
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    return finalUsage
  }

  return { pipe }
}

module.exports = { createStreamConverter }
