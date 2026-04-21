import fs from 'fs'
import path from 'path'

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache')
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dager

export function cacheGet<T>(key: string): T | null {
  const file = path.join(CACHE_DIR, `${key}.json`)
  if (!fs.existsSync(file)) return null
  try {
    const { timestamp, data } = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (Date.now() - timestamp > TTL_MS) return null
    return data as T
  } catch {
    return null
  }
}

export function cacheSet(key: string, data: unknown): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
  const file = path.join(CACHE_DIR, `${key}.json`)
  fs.writeFileSync(file, JSON.stringify({ timestamp: Date.now(), data }, null, 2))
}

export function cacheClear(key: string): void {
  const file = path.join(CACHE_DIR, `${key}.json`)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
