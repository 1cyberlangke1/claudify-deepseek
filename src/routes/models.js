const config = require('../config')

async function handleModels(req, res) {
  try {
    const upstreamRes = await fetch(`${config.upstreamBaseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${config.upstreamApiKey}`,
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
