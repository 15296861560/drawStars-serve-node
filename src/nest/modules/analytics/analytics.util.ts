import { createHash, randomUUID } from 'crypto'

/** 与 Umami 类似的确定性 session uuid（同月同指纹复用） */
export function buildSessionUuid(
  websiteId: number,
  hostname: string,
  ip: string,
  userAgent: string,
  os: string
): string {
  const monthSalt = `${new Date().getUTCFullYear()}-${new Date().getUTCMonth() + 1}`
  const raw = [
    websiteId,
    hostname || '',
    ip || '',
    userAgent || '',
    os || '',
    monthSalt
  ].join('|')
  const hash = createHash('sha256').update(raw).digest('hex')
  // 格式化为 UUID 形态
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-')
}

export function newWebsiteUuid() {
  return randomUUID()
}

export function parseUserAgent(ua = '') {
  const lower = ua.toLowerCase()
  let browser = 'unknown'
  if (lower.includes('edg/')) browser = 'edge'
  else if (lower.includes('chrome')) browser = 'chrome'
  else if (lower.includes('firefox')) browser = 'firefox'
  else if (lower.includes('safari')) browser = 'safari'
  else if (lower.includes('msie') || lower.includes('trident')) browser = 'ie'

  let os = 'unknown'
  if (lower.includes('windows')) os = 'windows'
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macos'
  else if (lower.includes('android')) os = 'android'
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'ios'
  else if (lower.includes('linux')) os = 'linux'

  let device = 'desktop'
  if (
    lower.includes('mobile') ||
    lower.includes('iphone') ||
    lower.includes('android')
  ) {
    device = 'mobile'
  } else if (lower.includes('ipad') || lower.includes('tablet')) {
    device = 'tablet'
  }

  return { browser, os, device }
}

export function getClientIp(req: {
  headers: Record<string, unknown>
  ip?: string
  socket?: { remoteAddress?: string }
}) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || ''
}

export function truncate(str: string | undefined | null, max = 500) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) : str
}

/** 将来源整理为展示名 */
export function normalizeReferrer(
  referrer: string | null | undefined,
  domain?: string | null
) {
  if (!referrer || referrer === 'null' || referrer === 'undefined') {
    return '直接访问'
  }
  try {
    if (referrer.startsWith('/')) return '站内跳转'
    const u = new URL(referrer)
    if (
      domain &&
      (u.hostname === domain || u.hostname.endsWith(`.${domain}`))
    ) {
      return '站内跳转'
    }
    const host = u.hostname.replace(/^www\./, '')
    if (host.includes('google')) return 'Google'
    if (host.includes('baidu')) return '百度'
    if (host.includes('bing')) return 'Bing'
    if (host.includes('so.com') || host.includes('360')) return '360搜索'
    if (host.includes('sogou')) return '搜狗'
    if (host.includes('github')) return 'GitHub'
    if (host.includes('twitter') || host.includes('x.com')) return 'Twitter/X'
    if (host.includes('weibo')) return '微博'
    return host
  } catch {
    return referrer.slice(0, 64) || '直接访问'
  }
}

export function fillDateBuckets(
  rows: Array<{ t: string; y: number }>,
  start: Date,
  end: Date,
  unit: string
): Array<{ t: string; y: number }> {
  const map = new Map(
    rows.map(r => [normalizeBucketKey(String(r.t), unit), Number(r.y) || 0])
  )
  const out: Array<{ t: string; y: number }> = []
  const cur = new Date(start)
  const endAt = new Date(end)

  if (unit === 'hour') {
    cur.setMinutes(0, 0, 0)
    endAt.setMinutes(0, 0, 0)
    while (cur <= endAt) {
      const key = formatHour(cur)
      out.push({ t: key, y: map.get(key) || 0 })
      cur.setHours(cur.getHours() + 1)
    }
    return out
  }

  cur.setHours(0, 0, 0, 0)
  endAt.setHours(0, 0, 0, 0)
  while (cur <= endAt) {
    const key = formatDay(cur)
    out.push({ t: key, y: map.get(key) || 0 })
    if (unit === 'month') {
      cur.setMonth(cur.getMonth() + 1)
    } else {
      cur.setDate(cur.getDate() + 1)
    }
  }
  return out
}

function normalizeBucketKey(t: string, unit: string) {
  if (unit === 'hour') {
    // accept "YYYY-MM-DD HH:00:00" / "YYYY-MM-DDTHH:00:00" / ISO
    const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/)
    if (m) return `${m[1]} ${m[2]}:00:00`
    return t.slice(0, 19)
  }
  return t.slice(0, 10)
}

function formatDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatHour(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${formatDay(d)} ${pad(d.getHours())}:00:00`
}
