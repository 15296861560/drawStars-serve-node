/**
 * party 模块公共工具：
 * - clientKey 双级解析（token -> uid；否则来源 IP）
 * - 日期/种子随机（逐行镜像小程序 utils/mock.js，保证同一日期同一口令出数一致）
 * - query / body 多形态列表解析
 * - 历史行渲染（sessions/mine 与 profile 共享）
 */
import { randomUUID } from 'crypto'
import { GAME_MAP, LEVELS } from './data/constants'
import { WISH_DAILY } from './data/wishes'
import type { PartySession, PartySessionPlayer } from '@prisma/client'
import { isTokenServiceReady, verifyAccessToken } from '../../../lib/access-token-service'

/* ---------- 通用 ---------- */
export function genId(): string {
  return randomUUID().replace(/-/g, '')
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export const LEVEL_KEYS: string[] = LEVELS.map((l: { key: string }) => l.key)

/* ---------- clientKey ----------
 * schema.prisma 约定：client_key 正式 = TOKEN_VERIFY 解出的 uid；demo = 请求来源 IP
 */
export interface PartyRequestLike {
  auth?: { uid?: unknown; userId?: unknown; sub?: unknown } | null
  ip?: string | null
  socket?: { remoteAddress?: string | null } | null
}

function authUidKey(auth: PartyRequestLike['auth']): string {
  if (!auth) return ''
  const uid = auth.uid ?? auth.userId ?? auth.sub
  if (uid === undefined || uid === null || uid === '') return ''
  return 'tk_' + String(uid)
}

export function normalizeIp(ip?: string | null): string {
  const s = String(ip || '').replace(/^::ffff:/, '')
  if (!s) return 'unknown'
  return s.replace(/[ [\]:;%]/g, '_')
}

export function resolveClientKey(request: PartyRequestLike): string {
  const tk = authUidKey(request.auth)
  if (tk) return tk
  const ip = request.ip || (request.socket && request.socket.remoteAddress) || ''
  return 'ip_' + normalizeIp(ip)
}

/** WS 升级请求等无 express Request 的场景：手动解析 header（accesstoken / access-token / Bearer；IP 观众键取 XFF 优先，与 REST viewerKey 对齐） */
export function resolveClientKeyFromHeaders(
  headers: Record<string, unknown>,
  remoteAddress?: string | null
): string {
  const raw = headers['accesstoken'] ?? headers['access-token'] ?? headers['authorization']
  let token = ''
  if (typeof raw === 'string') token = raw
  else if (Array.isArray(raw) && typeof raw[0] === 'string') token = raw[0]
  if (token.startsWith('Bearer ')) token = token.slice(7)
  if (token && isTokenServiceReady()) {
    const payload = verifyAccessToken(token)
    const tk = payload ? authUidKey(payload as PartyRequestLike['auth']) : ''
    if (tk) return tk
  }
  // 反向代理链路下与 REST 侧 viewerKey 同源取 XFF 首跳；直连场景无该头走 remoteAddress
  const xffRaw = headers['x-forwarded-for']
  const xffFirst = (
    typeof xffRaw === 'string'
      ? xffRaw
      : Array.isArray(xffRaw) && typeof xffRaw[0] === 'string'
        ? xffRaw[0]
        : ''
  )
    .split(',')[0]
    .trim()
  if (xffFirst) return 'ip_' + normalizeIp(xffFirst)
  return 'ip_' + normalizeIp(remoteAddress)
}

/* ---------- 日期工具（镜像 mock.js） ---------- */
export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

export function fmtDate(ts?: number | Date | null): string {
  const d = ts instanceof Date ? ts : new Date((ts as number) || Date.now())
  return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate())
}

export function dayKey(offsetDays?: number): string {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000)
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
}

export function dayIndex(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.floor((now.getTime() - start.getTime()) / 86400000)
}

export function hourIndex(): number {
  return new Date().getHours()
}

/* ---------- 种子随机（镜像 mock.js：FNV-1a + mulberry32） ---------- */
export function seedOf(str: string): number {
  let h = 2166136261
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h >>> 0
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffleSeed<T>(arr: T[], seed: string): T[] {
  const list = arr.slice()
  const rnd = seeded(seedOf(seed))
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = list[i]
    list[i] = list[j]
    list[j] = t
  }
  return list
}

/* ---------- 列表解析（body / query / Prisma Json 多形态收敛） ---------- */
export function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s)
        if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
      } catch {
        /* 非 JSON 保持为空 */
      }
    }
  }
  return []
}

export function parseBodyList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s)
        if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
      } catch {
        /* 非 JSON 走 CSV */
      }
    }
    return s.split(',').map(x => x.trim()).filter(Boolean)
  }
  return []
}

/** query 多维载体：themes=A,B / themes="["a","b"]" / themes=a&themes=b / themes[0]=a */
export function gatherList(query: Record<string, unknown>, key: string): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    for (const s of parseBodyList(v)) out.push(s)
  }
  const direct = query[key]
  if (direct !== undefined) add(direct)
  for (let i = 0; i < 12; i++) {
    const v0 = query[key + '[' + i + ']']
    const v1 = query[key + i]
    if (v0 === undefined && v1 === undefined) break
    if (v0 !== undefined) add(v0)
    else if (v1 !== undefined) add(v1)
  }
  return out
}

/* ---------- party 常量 / 渲染纯函数 ---------- */
export const DEFAULT_ROUNDS: Record<string, number> = { tod: 8, draw: 5, lady: 0, bluff: 5, dice: 0 }

export const MVP_BADGES: Record<string, string> = {
  tod: '温柔到心动的星',
  draw: '作画最快的星星',
  lady: '星愿加冕者',
  bluff: '一本正经瞎掰王',
  dice: '胆量担当',
}

export const CARD_BACKGROUND = 'starry_night_v1'

/** 当日签文案（镜像 mock.js mockDailyWish 的取数口径） */
export function dailyWishText(): string {
  return WISH_DAILY[dayIndex() % WISH_DAILY.length] || ''
}

export function channelOf(sessionId: string): string {
  return 'party.session.' + sessionId
}

/** channelOf 反函数：'party.session.<id>' → id；非该前缀返回空串 */
export function sessionIdOf(channelId: string): string {
  const p = 'party.session.'
  return channelId.startsWith(p) ? channelId.slice(p.length) : ''
}

export function partyEnvelope(channelId: string, type: string, data: unknown): string {
  return JSON.stringify({ ns: 'party.session', channelId, type, data })
}

/** 最近趣局历史行（home 列表与 profile.history 同一形状） */
export function buildHistoryRow(session: PartySession, players: PartySessionPlayer[]) {
  const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
  const meta = gameMap[session.gameType]
  const host = players.find(p => p.isHost)
  const startedAt = session.startedAt ? session.startedAt.getTime() : 0
  const closedAt = session.closedAt ? session.closedAt.getTime() : 0
  return {
    id: session.id,
    code: session.code,
    gameType: session.gameType,
    gameName: meta && meta.name ? meta.name : session.gameType,
    gameEmoji: meta && meta.emoji ? meta.emoji : '',
    playedAt: fmtDate(session.closedAt || session.createdAt),
    playersCount: players.length,
    durationMin: startedAt && closedAt ? Math.max(1, Math.round((closedAt - startedAt) / 60000)) : 0,
    myScore: 0,
    mvpName: host && host.name ? host.name : '',
  }
}
