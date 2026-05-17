const express = require('express')
const { handleMessages } = require('./routes/messages')
const { handleModels } = require('./routes/models')
const logger = require('./utils/logger')

function createServer() {
  const app = express()

  app.use(express.json({ limit: '32mb' }))

  app.use((req, res, next) => {
    const start = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - start
      const level = res.statusCode >= 400 ? 'warn' : 'info'
      logger[level](`${req.method} ${req.originalUrl}`, { status: res.statusCode, ms })
    })
    next()
  })

  app.post('/v1/messages', handleMessages)

  app.get('/v1/models', handleModels)

  app.get('/health', (req, res) => res.json({ status: 'ok' }))

  return app
}

module.exports = { createServer }
