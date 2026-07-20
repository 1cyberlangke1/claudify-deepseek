const fs = require('fs')
const path = require('path')
const logger = require('./logger')

const buf = []
let counter = 0

function snapshot(prev, curr, label) {
  const now = new Date()
  const stamp =
    `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-` +
    `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
  const fname = `cache-drop-${stamp}.log`
  const fpath = path.join(process.env.LOG_DIR || 'logs', fname)
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`

  const lines = [
    `[${ts}] [${label}] ${prev.rate}% → ${curr.rate}% (drop: ${(prev.rate - curr.rate).toFixed(1)}pp)`,
    `[${ts}] [BEFORE] msg_count=${prev.msg_count} in_tokens=${prev.in_tokens} vision_cache=${prev.vision_cache}`,
    `[${ts}] [AFTER]  msg_count=${curr.msg_count} in_tokens=${curr.in_tokens} vision_cache=${curr.vision_cache}`,
    `[${ts}] [BODY BEFORE] ${prev.body}`,
    `[${ts}] [BODY AFTER] ${curr.body}`,
    '',
  ]
  fs.writeFileSync(fpath, lines.join('\n'), 'utf8')
  logger.warn('→ cache drop', { from: prev.rate, to: curr.rate, drop: (prev.rate - curr.rate).toFixed(1), file: fname })
}

function record(curr) {
  if (process.env.CACHE_MONITOR !== 'true') return

  buf.push(curr)
  if (buf.length > 3) buf.shift()

  counter++
  if (counter % 3 === 0 && buf.length >= 2) {
    snapshot(buf[buf.length - 2], buf[buf.length - 1], 'INTERVAL')
  }

  if (buf.length >= 2) {
    const prev = buf[buf.length - 2]
    const drop = prev.rate - curr.rate
    if (drop > 20) {
      snapshot(prev, curr, 'CACHE DROP')
    }
  }
}

module.exports = { record }
