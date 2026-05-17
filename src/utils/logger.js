const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const level = (process.env.LOG_LEVEL || 'info').toLowerCase()

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[0m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
}

function log(lvl, msg, meta) {
  if (LEVELS[lvl] < LEVELS[level]) return
  const ts = new Date().toISOString()
  const c = COLORS[lvl] || COLORS.info
  const line = meta
    ? `[${c}${ts}${COLORS.reset}] [${c}${lvl.toUpperCase()}${COLORS.reset}] ${msg} ${COLORS.dim}${JSON.stringify(meta)}${COLORS.reset}`
    : `[${c}${ts}${COLORS.reset}] [${c}${lvl.toUpperCase()}${COLORS.reset}] ${msg}`
  if (lvl === 'error') console.error(line)
  else console.log(line)
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
}
