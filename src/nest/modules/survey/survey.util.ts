import { BadRequestException } from '@nestjs/common'

export type AuthInfo = {
  uid?: string | number
  userId?: string | number
  roleCodes?: string[]
  permissions?: string[]
}

export function resolveUserId(
  auth?: AuthInfo,
  fallback?: string | number
): number {
  if (auth?.uid != null && auth.uid !== '') {
    const n = Number(auth.uid)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (auth?.userId != null && auth.userId !== '') {
    const n = Number(auth.userId)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (fallback != null && fallback !== '') {
    const n = Number(fallback)
    if (Number.isFinite(n) && n > 0) return n
  }
  throw new BadRequestException('缺少用户ID')
}

export function tryResolveUserId(
  auth?: AuthInfo,
  fallback?: string | number
): number | null {
  try {
    return resolveUserId(auth, fallback)
  } catch {
    return null
  }
}

export function generateShareCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export function toNum(v: bigint | number | null | undefined): number | null {
  if (v == null) return null
  return Number(v)
}

export function parseJson<T = unknown>(v: unknown, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}

export function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return {}
}

export function getClientIp(req?: {
  headers?: Record<string, unknown>
  ip?: string
  socket?: { remoteAddress?: string }
}): string | null {
  if (!req) return null
  const xf = req.headers?.['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim()
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).trim()
  if (req.ip) return req.ip
  return req.socket?.remoteAddress || null
}

export function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => r.map(escapeCsv).join(','))
  ]
  return lines.join('\n')
}
