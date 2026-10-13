/**
 * 星光战绩（PRD 4.9）：
 * - user 形状镜像小程序 store.getUser（rank 为 label 串、token 恒空串）
 * - 徽章解锁按真实数据计算（非本地演示写死）
 */
import { Injectable } from '@nestjs/common'
import type { PartyProfile } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { BADGES, RANKS, rankOf } from './data/constants'
import { buildHistoryRow, genId } from './party.util'

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
}
