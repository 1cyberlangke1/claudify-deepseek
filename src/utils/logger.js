const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const level = (process.env.LOG_LEVEL || 'info').toLowerCase()

function log(lvl, msg, meta) {
  if (LEVELS[lvl] < LEVELS[level]) return
  const ts = new Date().toISOString()
  const line = meta
    ? `[${ts}] [${lvl.toUpperCase()}] ${msg} ${JSON.stringify(meta)}`
    : `[${ts}] [${lvl.toUpperCase()}] ${msg}`
  if (lvl === 'error') console.error(line)
  else console.log(line)
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
}
