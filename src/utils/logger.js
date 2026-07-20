const winston = require('winston')
const path = require('path')

const logLevel = process.env.LOG_LEVEL || 'info'
const logDir = process.env.LOG_DIR || 'logs'
const maxSize = parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10485760
const maxFiles = parseInt(process.env.LOG_FILE_MAX_FILES, 10) || 5

function localTimestamp() {
  const d = new Date()
  const y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const tzH = String(Math.abs(Math.floor(off / 60))).padStart(2, '0')
  const tzM = String(Math.abs(off % 60)).padStart(2, '0')
  return `${y}-${M}-${D}T${h}:${m}:${s}.${ms}${sign}${tzH}:${tzM}`
}

const logFormat = winston.format.printf(({ level, message, ...meta }) => {
  const ts = localTimestamp()
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}`
})

const transports = [
  new winston.transports.Console({
    level: logLevel,
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat,
    ),
  }),
]

if (process.env.LOG_FILE_ENABLED !== 'false') {
  transports.push(
    new winston.transports.File({
      dirname: logDir,
      filename: 'claudify.log',
      level: logLevel,
      maxsize: maxSize,
      maxFiles,
      format: logFormat,
      zippedArchive: true,
    }),
  )
}

const logger = winston.createLogger({
  level: logLevel,
  transports,
})

module.exports = logger
