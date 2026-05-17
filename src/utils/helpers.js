function getApiKey(req) {
  const auth = req.headers['authorization']
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return req.headers['x-api-key'] || bearer || null
}

function estimatePromptTokens(body) {
  let text = ''
  if (body.system) text += body.system + ' '
  if (body.messages) {
    for (const m of body.messages) {
      if (typeof m.content === 'string') text += m.content + ' '
      else if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text') text += b.text + ' '
          else if (b.type === 'tool_result') {
            if (typeof b.content === 'string') text += b.content + ' '
            else if (Array.isArray(b.content)) {
              for (const c of b.content) {
                if (c.type === 'text') text += c.text + ' '
              }
            }
          }
        }
      }
    }
  }
  if (body.tools) {
    for (const t of body.tools) {
      if (t.description) text += t.description + ' '
      if (t.name) text += t.name + ' '
    }
  }
  return Math.max(1, Math.round(text.length / 3.5))
}

function buildToolCallMap(toolCalls) {
  if (!toolCalls) return null
  const map = {}
  for (const tc of toolCalls) {
    map[tc.index] = map[tc.index] || { id: '', type: 'function', function: { name: '', arguments: '' } }
    if (tc.id) map[tc.index].id = tc.id
    if (tc.type) map[tc.index].type = tc.type
    if (tc.function) {
      if (tc.function.name) map[tc.index].function.name = tc.function.name
      if (tc.function.arguments) map[tc.index].function.arguments += tc.function.arguments
    }
  }
  return map
}

function parseToolCallDelta(delta) {
  if (!delta.tool_calls) return null
  return buildToolCallMap(delta.tool_calls)
}

module.exports = { getApiKey, estimatePromptTokens, buildToolCallMap, parseToolCallDelta }
