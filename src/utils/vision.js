const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const cache = require('./cache')

const cacheStats = { hit: 0, miss: 0 }
let batchStats = { hit: 0, miss: 0 }

function resetBatch() { batchStats = { hit: 0, miss: 0 } }

function getBatchStats() {
  const total = batchStats.hit + batchStats.miss
  return total > 0
    ? { hit: batchStats.hit, miss: batchStats.miss, rate: (batchStats.hit / total * 100).toFixed(1) + '%' }
    : { hit: 0, miss: 0, rate: '0%' }
}

function getStats() {
  const total = cacheStats.hit + cacheStats.miss
  return total > 0
    ? { hit: cacheStats.hit, miss: cacheStats.miss, rate: (cacheStats.hit / total * 100).toFixed(1) + '%' }
    : { hit: 0, miss: 0, rate: '0%' }
}

function resolvePromptFile() {
  const f = process.env.VISION_PROMPT_FILE
  if (!f) return path.join(__dirname, '..', 'VISION_PROMPT.md')
  if (path.isAbsolute(f)) return f
  return path.resolve(process.cwd(), f)
}

function getPrompt() {
  const file = resolvePromptFile()
  try { return fs.readFileSync(file, 'utf8').trim() } catch {
    return 'Describe this image in detail'
  }
}

function isEnabled() {
  return process.env.VISION_ENABLED === 'true'
    && process.env.VISION_API_KEY
    && process.env.VISION_MODEL
    && process.env.VISION_BASE_URL
}

async function describeImage(base64Data, mediaType) {
  const hash = crypto.createHash('sha256').update(base64Data).digest('hex')
  const cached = await cache.get(hash)
  if (cached) {
    cacheStats.hit++
    batchStats.hit++
    return cached
  }

  cacheStats.miss++
  batchStats.miss++

  const baseUrl = process.env.VISION_BASE_URL.replace(/\/+$/, '')
  const model = process.env.VISION_MODEL
  const apiKey = process.env.VISION_API_KEY
  const prompt = getPrompt()
  const timeoutMs = parseInt(process.env.VISION_TIMEOUT_MS, 10) || 60000

  const dataUri = `data:${mediaType || 'image/jpeg'};base64,${base64Data}`

  logger.info('→ vision describe', { model, hash: hash.slice(0, 12), prompt_len: prompt.length, timeout: timeoutMs })

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      const text = await res.text()
      return `[Vision error: ${res.status} ${text}]`
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    logger.debug('vision raw', { hash: hash.slice(0, 12), response: JSON.stringify(data).slice(0, 500) })
    if (!content || !content.trim()) return '[Vision error: empty response]'

    await cache.set(hash, content).catch(() => {})
    logger.info('← vision cached', { hash: hash.slice(0, 12), len: content.length })
    return content
  } catch (err) {
    if (err.name?.includes('Abort') || err.name === 'TimeoutError') return '[Vision timeout]'
    return `[Vision error: ${err.message}]`
  }
}

module.exports = { isEnabled, describeImage, getStats, resetBatch, getBatchStats }
