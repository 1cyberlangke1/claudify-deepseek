const path = require('path')
const { CacheStack, MemoryLayer, DiskLayer } = require('layercache')

const cacheTTL = parseInt(process.env.VISION_CACHE_TTL, 10) || 604800
const memMax = parseInt(process.env.VISION_CACHE_MEM_MAX, 10) || 200
const diskDir = process.env.VISION_CACHE_DIR || path.join(process.cwd(), 'data', 'vision-cache')

const stack = new CacheStack([
  new MemoryLayer({ ttl: cacheTTL, maxSize: memMax }),
  new DiskLayer({ directory: diskDir }),
])

async function get(key) {
  try { return await stack.get(key) } catch { return null }
}

async function set(key, val) {
  try { await stack.set(key, val) } catch { /* ignore */ }
}

async function disconnect() {
  try { await stack.disconnect() } catch { /* ignore */ }
}

module.exports = { get, set, disconnect }
