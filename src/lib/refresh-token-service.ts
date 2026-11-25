import crypto from 'crypto'
import {
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common'
import { buildUserToken } from './access-token-service'
import { prisma } from './prisma'
import redisClient from '../public/db/redis/client'

const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60
const REFRESH_KEY_PREFIX = 'auth:refresh:'
const INVALID_REFRESH_MESSAGE = 'refresh token无效或已过期'

interface RefreshSession {
  uid: string
  tokenHash: string
  expiresAt: number
}

export interface AuthTokens {
  token: string
  refreshToken: string
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException('登录会话服务不可用')
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException(INVALID_REFRESH_MESSAGE)
}

function readyRedisClient() {
  const client = redisClient.getClient()
  if (!client || client.isOpen !== true || client.isReady !== true) {
    throw unavailable()
  }
  return client
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function createRefreshToken(sid: string = crypto.randomUUID()): string {
  return `rt.${sid}.${crypto.randomBytes(32).toString('base64url')}`
}

function parseRefreshToken(token: string): { sid: string; key: string } {
  const [prefix, sid, secret, ...rest] = String(token || '').split('.')
  if (
    prefix !== 'rt' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sid || ''
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret || '') ||
    rest.length > 0
  ) {
    throw invalidRefreshToken()
  }
  return { sid, key: `${REFRESH_KEY_PREFIX}${sid}` }
}

async function readSession(refreshToken: string): Promise<{
  key: string
  session: RefreshSession
}> {
  const { key } = parseRefreshToken(refreshToken)
  let raw: string | null
  try {
    raw = await readyRedisClient().get(key)
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error
    throw unavailable()
  }
  if (!raw) throw invalidRefreshToken()

  let session: RefreshSession
  try {
    session = JSON.parse(raw) as RefreshSession
  } catch {
    throw invalidRefreshToken()
  }
  if (
    !session.uid ||
    !session.tokenHash ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now()
  ) {
    throw invalidRefreshToken()
  }
  return { key, session }
}

async function assertActiveUser(uid: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: BigInt(uid) },
    select: { status: true, deletedAt: true }
  })
  if (!user || user.deletedAt || (user.status && user.status !== 'active')) {
    throw invalidRefreshToken()
  }
}

function buildAccessToken(uid: string): string {
  const token = buildUserToken(uid)
  if (!token) throw unavailable()
  return token
}

export async function createAuthSession(
  uid: string | number
): Promise<AuthTokens> {
  const token = buildAccessToken(String(uid))
  const sid = crypto.randomUUID()
  const refreshToken = createRefreshToken(sid)
  const session: RefreshSession = {
    uid: String(uid),
    tokenHash: tokenHash(refreshToken),
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_SEC * 1000
  }

  try {
    await readyRedisClient().set(
      `${REFRESH_KEY_PREFIX}${sid}`,
      JSON.stringify(session),
      { EX: REFRESH_TOKEN_TTL_SEC }
    )
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error
    throw unavailable()
  }
  return { token, refreshToken }
}

export async function rotateAuthSession(
  refreshToken: string
): Promise<AuthTokens> {
  const { key, session } = await readSession(refreshToken)
  if (session.tokenHash !== tokenHash(refreshToken)) {
    try {
      await readyRedisClient().del(key)
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw unavailable()
    }
    throw invalidRefreshToken()
  }

  await assertActiveUser(session.uid)
  const token = buildAccessToken(session.uid)
  const nextRefreshToken = createRefreshToken(
    key.slice(REFRESH_KEY_PREFIX.length)
  )
  const nextSession: RefreshSession = {
    ...session,
    tokenHash: tokenHash(nextRefreshToken)
  }

  // 比较并轮换必须原子执行；旧凭证重放时撤销整个刷新会话。
  const script = `
    local current = redis.call('GET', KEYS[1])
    if not current then
      return 0
    end
    local ok, data = pcall(cjson.decode, current)
    if not ok or data.tokenHash ~= ARGV[1] then
      redis.call('DEL', KEYS[1])
      return -1
    end
    redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
    return 1
  `

  try {
    const result = await readyRedisClient().eval(script, {
      keys: [key],
      arguments: [session.tokenHash, JSON.stringify(nextSession)]
    })
    if (Number(result) !== 1) throw invalidRefreshToken()
  } catch (error) {
    if (
      error instanceof ServiceUnavailableException ||
      error instanceof UnauthorizedException
    ) {
      throw error
    }
    throw unavailable()
  }

  return { token, refreshToken: nextRefreshToken }
}

export async function revokeAuthSession(refreshToken: string): Promise<void> {
  let key: string
  try {
    key = parseRefreshToken(refreshToken).key
  } catch {
    return
  }
  try {
    await readyRedisClient().del(key)
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error
    throw unavailable()
  }
}
