function getApiKey(req) {
  const auth = req.headers['authorization']
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return req.headers['x-api-key'] || bearer || null
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

module.exports = { getApiKey, buildToolCallMap, parseToolCallDelta }
