const fs = require('fs')
const path = require('path')
const logger = require('./logger')

const buf = []
let counter = 0

function genDiff(b, a) {
  const parts = []
  const minLen = Math.min(b.length, a.length)
  let i = 0
  while (i < minLen) {
    if (b[i] !== a[i]) {
      const cStart = Math.max(0, i - 40)
      const cEnd = Math.min(b.length, i + 80)
      const before = (cStart > 0 ? '..' : '') + b.substring(cStart, cEnd).replace(/\n/g, '\\n')
      const after  = (cStart > 0 ? '..' : '') + a.substring(cStart, cEnd).replace(/\n/g, '\\n')
      parts.push(`  at byte ${i}:\n    BEFORE: ${before}\n    AFTER:  ${after}`)
      if (parts.length >= 5) break

      const skipB = b.indexOf('}', i + 1)
      const skipA = a.indexOf('}', i + 1)
      const skip = Math.max(
        skipB > 0 ? skipB - i : 0,
        skipA > 0 ? skipA - i : 0,
        1
      )
      i += Math.max(skip, 80)
    } else {
      i++
    }
  }
  if (b.length !== a.length) {
    parts.push(`  length: ${b.length} → ${a.length} (${a.length - b.length >= 0 ? '+' : ''}${a.length - b.length})`)
  }
  return parts.join('\n')
}

function snapshot(prev, curr, label) {
  const now = new Date()
  const stamp =
    `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-` +
    `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`
  const fname = `cache-drop-${stamp}.log`
  const fpath = path.join(process.env.LOG_DIR || 'logs', fname)
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`

  const labelText = label === 'CACHE DROP' ? `DROP ${(prev.rate - curr.rate).toFixed(1)}pp` :
                    label === 'CACHE JUMP' ? `JUMP ${(curr.rate - prev.rate).toFixed(1)}pp` :
                    `INTERVAL ${(prev.rate - curr.rate).toFixed(1)}pp`

  const diff = genDiff(prev.body, curr.body)

  const lines = [
    `[${ts}] [${label}] ${labelText}`,
    `[${ts}] [BEFORE] msg_count=${prev.msg_count} in_tokens=${prev.in_tokens} cache=${prev.rate}% vision=${prev.vision_cache}`,
    `[${ts}] [AFTER]  msg_count=${curr.msg_count} in_tokens=${curr.in_tokens} cache=${curr.rate}% vision=${curr.vision_cache}`,
    `[${ts}] [DIFF]`,
    diff,
    `[${ts}] [BODY BEFORE] ${prev.body}`,
    `[${ts}] [BODY AFTER] ${curr.body}`,
    '',
  ]
  fs.writeFileSync(fpath, lines.join('\n'), 'utf8')

  const pp = (prev.rate - curr.rate).toFixed(1)
  const dir = parseFloat(pp) >= 0 ? 'drop' : 'jump'
  logger.warn(`→ cache ${dir}`, { from: prev.rate, to: curr.rate, pp: Math.abs(parseFloat(pp)).toFixed(1), file: fname })
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

    const jump = curr.rate - prev.rate
    if (jump > 50 && prev.rate < 50 && curr.rate > 80) {
      snapshot(prev, curr, 'CACHE JUMP')
    }
  }
}

module.exports = { record }
