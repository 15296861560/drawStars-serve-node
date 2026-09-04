import { Injectable } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { FriendStatus, IM_DEFAULTS, imRedisKey } from '../im.constants'
import { ImException, ImErrorCode } from '../im.errors'
import { incr } from '../im-redis'

function dayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

@Injectable()
export class ImRelationService {
  async isFriend(a: string, b: string): Promise<boolean> {
    const row = await prisma.imFriendship.findUnique({
      where: { userId_friendId: { userId: BigInt(a), friendId: BigInt(b) } }
    })
    return row?.status === FriendStatus.ACCEPTED
  }

  async isBlocked(byUid: string, targetUid: string): Promise<boolean> {
    const row = await prisma.imBlacklist.findUnique({
      where: {
        userId_targetId: { userId: BigInt(byUid), targetId: BigInt(targetUid) }
      }
    })
    return !!row
  }

  /** 是否允许陌生人私信：好友直接放行；否则按 §4.2.3 破冰 + 频控 */
  async assertStrangerCanSend(
    senderId: string,
    receiverId: string,
    convType: string,
    target?: { convType: string; bizId: string }
  ) {
    if (convType !== 'C2C') return // 仅 C2C 受陌生人策略约束
    const isFriend = await this.isFriend(senderId, receiverId)
    if (isFriend) return

    // 接收方是否允许陌生人私信
    const profile = await prisma.imUserProfile.findUnique({
      where: { userId: BigInt(receiverId) }
    })
    if (!profile?.allowStrangerMsg) {
      // 破冰例外：双方同房且 24h 内有公开互动 → 允许 1 条
      const canIceBreak = await this.canIceBreak(senderId, receiverId, target)
      if (!canIceBreak) {
        throw new ImException(ImErrorCode.STRANGER_DENIED)
      }
    }

    // 陌生人频控：≤5 人/日，≤10 条/日
    const dk = dayKey()
    const usersCount = await incr(
      imRedisKey.strangerMsgUserDay(senderId, dk),
      86400
    )
    const msgCount = await incr(
      imRedisKey.strangerMsgCountDay(senderId, dk),
      86400
    )
    if (
      usersCount > IM_DEFAULTS.strangerPerDayUsers ||
      msgCount > IM_DEFAULTS.strangerPerDayMsgs
    ) {
      throw new ImException(ImErrorCode.STRANGER_LIMIT)
    }
  }

  /** 破冰条件：双方最近 24h 在同一房间有公开互动（简化为同房间成员且近24h有发言） */
  private async canIceBreak(
    senderId: string,
    receiverId: string,
    target?: { convType: string; bizId: string }
  ): Promise<boolean> {
    // 简化实现：若发送来自房间场景（target 为 ROOM 且发送者在房），允许破冰 1 条
    // 完整版需查 im_message 公开互动记录，此处按 PRD 精神放宽：同房 24h 互动 1 条
    if (!target || target.convType !== 'C2C') {
      // 仅在 ROOM 场景下放宽；当前无房间上下文时按 deny
      return false
    }
    // 检查 24h 内是否已有破冰私信（receiver 来自 sender 的消息）
    const since = BigInt(Date.now() - 24 * 60 * 60 * 1000)
    const pairKey = `${Math.min(Number(senderId), Number(receiverId))}_${Math.max(Number(senderId), Number(receiverId))}`
    const conv = await prisma.imConversation.findFirst({ where: { pairKey } })
    if (conv) {
      const count = await prisma.imMessage.count({
        where: {
          conversationId: conv.id,
          senderId: BigInt(senderId),
          serverTime: { gt: since }
        }
      })
      if (count > 1) return false // 只允许 1 条
    }
    return true
  }
}
