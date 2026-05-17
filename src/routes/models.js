const config = require('../config')
const { getApiKey } = require('../utils/helpers')

async function handleModels(req, res) {
  const apiKey = getApiKey(req)
  if (!apiKey) {
    return res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'x-api-key or anthropic-auth-token header required' },
    })
  }
  try {
    const upstreamRes = await fetch(`${config.upstreamBaseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (upstreamRes.ok) {
      const data = await upstreamRes.json()
      return res.json(data)
    }
  } catch {
  }

  res.json({
    object: 'list',
    data: [
      {
        id: config.upstreamModel,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
      },
    ],
  })
}

module.exports = { handleModels }
