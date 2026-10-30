/**
 * 星光战绩（PRD 4.9）：
 * - user 形状镜像小程序 store.getUser（rank 为 label 串、token 恒空串）
 * - 徽章解锁按真实数据计算（非本地演示写死）
 * - 我的信息：改名（ensureProfile 同口径）/ 手机号换绑（复用榛子短信验证码链路）
 */
import { Injectable } from '@nestjs/common'
import type { PartyProfile } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { BADGES, RANKS, rankOf } from './data/constants'
import { buildHistoryRow, genId } from './party.util'
import userService from '../../../public/service/userService'
import userRedisClient from '../../../public/db/redis/client'

/** 验证码 Redis key 前缀（与 login/resetPwd 码隔离；key 形态 `${type}-${phone}`） */
const CAPTCHA_TYPE = 'partyPhone'
/** 验证码有效期（秒），与 userService.getCaptcha 一致 */
const CAPTCHA_TTL = 120
const PHONE_RE = /^1[3-9]\d{9}$/

/** 11 位手机号脱敏：138****5678 */
export function maskPhone(phone: string): string {
  const p = String(phone || '').trim()
  return p.length === 11 ? p.slice(0, 3) + '****' + p.slice(7) : p
}

@Injectable()
export class PartyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** 确保档案存在；带明确昵称时顺带更新（限制 32 字） */
  async ensureProfile(clientKey: string, name?: string | null): Promise<PartyProfile> {
    const cleanName = String(name || '').trim().slice(0, 32)
    const existing = await this.prisma.client.partyProfile.findUnique({ where: { clientKey } })
    if (existing) {
      if (cleanName && cleanName !== existing.name) {
        return this.prisma.client.partyProfile.update({ where: { clientKey }, data: { name: cleanName } })
      }
      return existing
    }
    return this.prisma.client.partyProfile.create({
      data: { id: genId(), clientKey, name: cleanName || '星河旅人' },
    })
  }

  async getProfile(clientKey: string) {
    const profile = await this.ensureProfile(clientKey)
    const starVal = profile.starVal
    const rank = rankOf(starVal)
    const rankIdx = RANKS.indexOf(rank)
    const nextRank = rankIdx >= 0 && rankIdx + 1 < RANKS.length ? RANKS[rankIdx + 1] : null
    const progress = nextRank
      ? Math.min(100, Math.round(((starVal - rank.min) / (nextRank.min - rank.min)) * 100))
      : 100

    const rows = await this.prisma.client.partySessionPlayer.findMany({
      where: { clientKey },
      include: { session: { include: { players: true } } },
      orderBy: { session: { createdAt: 'desc' } },
      take: 20,
    })

    const playedRows = rows.filter(
      r => r.session && ['PLAYING', 'SETTLING', 'CLOSED'].includes(r.session.status)
    )
    const hostRows = rows.filter(r => r.isHost)

    let starMarkerUnlocked = false
    const myWish = await this.prisma.client.starWish.findUnique({ where: { clientKey } })
    if (myWish) {
      const likeCount = await this.prisma.client.starWishLike.count({
        where: { wishId: 'wish_' + myWish.id },
      })
      starMarkerUnlocked = likeCount >= 50
    }

    const unlocks: Record<string, boolean> = {
      first_star: playedRows.length >= 1,
      convener: hostRows.length >= 10,
      social_star: hostRows.some(r => r.session && r.session.playerLimit >= 8),
      star_marker: starMarkerUnlocked,
    }

    const badges = BADGES.map(
      (b: { key: string; emoji: string; label: string; condition: string }) => ({
        key: b.key,
        emoji: b.emoji,
        label: b.label,
        condition: b.condition,
        unlocked: !!unlocks[b.key],
      })
    )

    const history = rows
      .slice(0, 3)
      .map(r => buildHistoryRow(r.session, r.session.players))

    return {
      user: {
        id: 'u_me',
        name: profile.name,
        avatarUrl: profile.avatarUrl || '',
        starVal,
        rank: rank.label,
        token: '',
        phone: maskPhone(profile.phone),
        phoneVerified: profile.phoneVerified === true,
      },
      starVal,
      rank,
      nextRank,
      progress,
      history,
      badges,
    }
  }

  async getBadgeList(clientKey: string) {
    const profile = await this.getProfile(clientKey)
    return { list: profile.badges }
  }

  /* ---------- 我的信息：改名（PATCH /party/profile） ---------- */
  async updateProfile(clientKey: string, body: Record<string, unknown> | null | undefined) {
    const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const name = String(src.name || '').trim()
    if (!name) return { ok: false, msg: '昵称不能为空' }
    if (name.length > 32) return { ok: false, msg: '昵称最多 32 字' }
    await this.ensureProfile(clientKey, name)
    return this.getProfile(clientKey)
  }

  /* ---------- 换绑：发验证码（POST /party/profile/phone/code） ----------
   * 复用榛子短信链路（4 位码入 Redis，2 分钟过期，未过期不可重发）
   * 短信通道不可用时回显验证码（对齐 users.service 的 sms-captcha-fallback 语义），保持接口可用
   */
  async sendPhoneCode(phone: unknown) {
    const p = String(phone || '').trim()
    if (!PHONE_RE.test(p)) return { ok: false, msg: '手机号格式不正确' }
    try {
      await userService.getCaptcha(p, CAPTCHA_TYPE)
      return { ok: true, channel: 'sms', captcha: null, warning: null }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('未过期')) return { ok: false, msg: '验证码未过期，请稍后重试' }
      // 回显兜底：确保 Redis 中有码后返回给前端（生产接通短信后此处不再触达）
      const redisKey = `${CAPTCHA_TYPE}-${p}`
      const fallbackCode = String(Math.floor(Math.random() * 8999) + 1000)
      if (!(await userRedisClient.exists(redisKey))) {
        await userRedisClient.set(redisKey, fallbackCode)
        await userRedisClient.expire(redisKey, CAPTCHA_TTL)
      }
      const stored = (await userRedisClient.get(redisKey)) || fallbackCode
      console.log(`[sms-captcha-fallback] ${p} type=${CAPTCHA_TYPE} code=${stored}`)
      return { ok: true, channel: 'sms-fallback', captcha: String(stored), warning: msg }
    }
  }

  /* ---------- 换绑：验码落库（PUT /party/profile/phone） ---------- */
  async changePhone(clientKey: string, phone: unknown, captcha: unknown) {
    const p = String(phone || '').trim()
    const code = String(captcha || '').trim()
    if (!PHONE_RE.test(p)) return { ok: false, msg: '手机号格式不正确' }
    if (!code) return { ok: false, msg: '请输入验证码' }

    const passed = await userService
      .verifyCaptcha(p, code, CAPTCHA_TYPE)
      .catch(() => false)
    if (!passed) return { ok: false, msg: '验证码错误或已过期' }

    await this.ensureProfile(clientKey)
    await this.prisma.client.partyProfile.update({
      where: { clientKey },
      data: { phone: p, phoneVerified: true, phoneUpdatedAt: new Date() },
    })
    return { ok: true, phone: maskPhone(p), phoneVerified: true }
  }
}
