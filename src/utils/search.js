const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp'

let client = null

async function getClient() {
  if (client) return client

  const headers = {}
  const apiKey = process.env.EXA_API_KEY || ''
  if (apiKey) headers['x-api-key'] = apiKey

  const transport = new StreamableHTTPClientTransport(new URL(EXA_MCP_URL), {
    headers,
  })

  client = new Client({ name: 'claudify-deepseek', version: '1.0.0' })
  await client.connect(transport)
  return client
}

function parseExaResults(text) {
  const blocks = text.split(/\n---\n/)
  return blocks.map(block => {
    const title = block.match(/^Title: (.+)$/m)?.[1] || ''
    const url = block.match(/^URL: (.+)$/m)?.[1] || ''
    const snippet = block.includes('Highlights:')
      ? block.substring(block.indexOf('Highlights:') + 11).trim()
      : ''
    if (!url) return null
    return {
      type: 'web_search_result',
      url,
      title,
      encrypted_content: Buffer.from(snippet).toString('base64'),
      page_age: null,
    }
  }).filter(Boolean)
}

async function webSearch(query, numResults = 5) {
  const c = await getClient()
  const result = await c.callTool({
    name: 'web_search_exa',
    arguments: { query, numResults },
  })
  const text = (result.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const structuredResults = parseExaResults(text)
  return { text, results: structuredResults, raw: result }
}

module.exports = { webSearch }
