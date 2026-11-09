/**
 * 星光战绩（PRD 4.9）：
 * - user 形状镜像小程序 store.getUser（rank 为 label 串、token 恒空串）
 * - 徽章解锁按真实数据计算（非本地演示写死）
 * - 我的信息：改名（ensureProfile 同口径）；手机号换绑已下线
 *   （个人主体无法开通微信手机号快速验证组件，注册标识改走 openid，
 *    phone/phoneVerified 表字段停用，仅在库中保留不再下发）
 */
import { Injectable } from '@nestjs/common'
import type { PartyProfile } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { BADGES, RANKS, rankOf } from './data/constants'
import { buildHistoryRow, dayKey, genId } from './party.util'

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

/* ---------- 读路径不建档（幽灵档案根修） ----------
   * GET profile / rank / tasks 等读接口只看不建：无档案的键回落瞬态对象（默认名 + 0 星），
   * 档案仅在真实留痕的写路径（登录注册 / 改名 / 领奖入账）中建档——
   * 无星光、无痕迹的浏览请求不再向 party_profile 里刷「星河旅人 0星」行
   */
  async readProfile(clientKey: string): Promise<PartyProfile | null> {
    return this.prisma.client.partyProfile.findUnique({ where: { clientKey } })
  }

  async getProfile(clientKey: string) {
    const profile =
      (await this.readProfile(clientKey)) ||
      ({ clientKey, name: '星河旅人', avatarUrl: '', starVal: 0 } as unknown as PartyProfile)
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

  /* ---------- 游客期数据迁移：设备键首次换到正式身份时并入 ----------
   * 登录拿到 tk_<uid> 后调用：把 dk_<key> 名下的星光/任务进度/对局席位/星愿/点赞全部并入正式档案，
   * - starVal 并账并以 source='migrate' 流水留痕；dk 改过名而 tk 仍是默认名时继承用户改的名字；
   * - 撞键以正式账号为准：同日同任务取进度较大者并保留 claimed，同场次座位/同愿取舍后去重，
   *   剩余行直接重挂 clientKey，避免撞 (session_id, client_key) 等唯一约束；
   * - dk 档案行并入后即删（星光已 0 移植不残留幽灵行），重复登录天然幂等
   * - 整体 $transaction 原子完成；失败抛错由调用方兜底（数据留在 dk 下次登录再并）
   */
  async absorbDeviceIdentity(deviceKey: string, userKey: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const dkProfile = await tx.partyProfile.findUnique({ where: { clientKey: deviceKey } })
      let tkProfile = await tx.partyProfile.findUnique({ where: { clientKey: userKey } })

      if (dkProfile) {
        if (!tkProfile) {
          tkProfile = await tx.partyProfile.create({
            data: { id: genId(), clientKey: userKey, name: dkProfile.name },
          })
        }
        if (dkProfile.starVal > 0) {
          const updated = await tx.partyProfile.update({
            where: { clientKey: userKey },
            data: { starVal: { increment: dkProfile.starVal } },
          })
          await tx.partyStarTrans.create({
            data: {
              id: genId(),
              clientKey: userKey,
              amount: dkProfile.starVal,
              balanceAfter: updated.starVal,
              source: 'migrate',
              day: dayKey(),
              remark: 'absorb_' + deviceKey,
            },
          })
        }
        if (tkProfile.name === '星河旅人' && dkProfile.name !== '星河旅人') {
          await tx.partyProfile.update({
            where: { clientKey: userKey },
            data: { name: dkProfile.name, avatarUrl: dkProfile.avatarUrl || tkProfile.avatarUrl },
          })
        }
        await tx.partyProfile.delete({ where: { clientKey: deviceKey } })
      }

      // 当日/历史任务进度归并（撞 (day, task_key) 取进度较大者、claimed 或并），其余整体重挂
      const tkTasks = await tx.partyTaskProgress.findMany({
        where: { clientKey: userKey },
        select: { id: true, day: true, taskKey: true, progress: true, claimed: true },
      })
      for (const t of tkTasks) {
        const dkRow = await tx.partyTaskProgress.findUnique({
          where: { clientKey_day_taskKey: { clientKey: deviceKey, day: t.day, taskKey: t.taskKey } },
        })
        if (!dkRow) continue
        if (dkRow.progress > t.progress || (dkRow.claimed && !t.claimed)) {
          await tx.partyTaskProgress.update({
            where: { id: t.id },
            data: { progress: Math.max(t.progress, dkRow.progress), claimed: t.claimed || dkRow.claimed },
          })
        }
        await tx.partyTaskProgress.delete({ where: { id: dkRow.id } })
      }
      await tx.partyTaskProgress.updateMany({
        where: { clientKey: deviceKey },
        data: { clientKey: userKey },
      })

      // 对局席位重挂；同局撞 (session_id, client_key) 时删除游客席位
      const tkSeats = await tx.partySessionPlayer.findMany({
        where: { clientKey: userKey },
        select: { sessionId: true },
      })
      if (tkSeats.length) {
        await tx.partySessionPlayer.deleteMany({
          where: { clientKey: deviceKey, sessionId: { in: tkSeats.map((r) => r.sessionId) } },
        })
      }
      await tx.partySessionPlayer.updateMany({
        where: { clientKey: deviceKey },
        data: { clientKey: userKey },
      })

      // 星愿：取较新者（保其点赞），另一条删除；无正式星愿则整体重挂
      const tkWish = await tx.starWish.findUnique({ where: { clientKey: userKey } })
      const dkWish = await tx.starWish.findUnique({ where: { clientKey: deviceKey } })
      if (tkWish && dkWish) {
        if (dkWish.updatedAt > tkWish.updatedAt) {
          await tx.starWish.update({ where: { id: dkWish.id }, data: { clientKey: userKey } })
          await tx.starWish.delete({ where: { id: tkWish.id } })
        } else {
          await tx.starWish.delete({ where: { id: dkWish.id } })
        }
      } else if (dkWish && !tkWish) {
        await tx.starWish.update({ where: { id: dkWish.id }, data: { clientKey: userKey } })
      }

      // 点赞重挂；撞 (wish_id, client_key) 时删除游客点赞
      const tkLikes = await tx.starWishLike.findMany({
        where: { clientKey: userKey },
        select: { wishId: true },
      })
      if (tkLikes.length) {
        await tx.starWishLike.deleteMany({
          where: { clientKey: deviceKey, wishId: { in: tkLikes.map((r) => r.wishId) } },
        })
      }
      await tx.starWishLike.updateMany({
        where: { clientKey: deviceKey },
        data: { clientKey: userKey },
      })
    })
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
}
