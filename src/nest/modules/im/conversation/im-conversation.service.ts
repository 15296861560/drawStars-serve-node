import { Injectable } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'
import { ConvType, IM_DEFAULTS } from '../im.constants'
import { ImException, ImErrorCode } from '../im.errors'

/** C2C pair_key：数值比较取 min_max */
export function c2cPairKey(a: string | number, b: string | number): string {
  const x = Number(a)
  const y = Number(b)
  const lo = Math.min(x, y)
  const hi = Math.max(x, y)
  return `${lo}_${hi}`
}

@Injectable()
export class ImConversationService {
  /** upsert C2C 会话；返回 conversationId，并确保双方 conv_user 存在 */
  async upsertC2C(userA: string, userB: string): Promise<bigint> {
    if (userA === userB)
      throw new ImException(ImErrorCode.NO_PERMISSION, '不能与自己单聊')
    const pairKey = c2cPairKey(userA, userB)
    let conv = await prisma.imConversation.findFirst({ where: { pairKey } })
    if (!conv) {
      conv = await prisma.imConversation.create({
        data: {
          convType: ConvType.C2C,
          bizId: pairKey,
          pairKey,
          status: 'ACTIVE',
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now())
        }
      })
    }
    await this.ensureConvUser(conv.id, userA)
    await this.ensureConvUser(conv.id, userB)
    return conv.id
  }

  /** upsert GROUP / ROOM 会话（bizId = groupId / roomId 字符串） */
  async upsertContainer(convType: ConvType, bizId: string): Promise<bigint> {
    let conv = await prisma.imConversation.findUnique({
      where: { convType_bizId: { convType, bizId } }
    })
    if (!conv) {
      conv = await prisma.imConversation.create({
        data: {
          convType,
          bizId,
          status: 'ACTIVE',
          createdAt: BigInt(Date.now()),
          updatedAt: BigInt(Date.now())
        }
      })
    }
    return conv.id
  }

  async ensureConvUser(conversationId: bigint, userId: string | number) {
    const uid = BigInt(userId)
    const exist = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId, userId: uid } }
    })
    if (!exist) {
      await prisma.imConversationUser.create({
        data: { conversationId, userId: uid, updatedAt: BigInt(Date.now()) }
      })
    }
    if (exist && exist.deletedAt) {
      await prisma.imConversationUser.update({
        where: { id: exist.id },
        data: { deletedAt: null, updatedAt: BigInt(Date.now()) }
      })
    }
    return exist
  }

  async getConversation(id: string | bigint) {
    return prisma.imConversation.findUnique({ where: { id: BigInt(id) } })
  }

  /** 会话列表（按 last_msg_time 倒序） */
  async listConversations(uid: string, curPage = 1, pageSize = 50) {
    const userId = BigInt(uid)
    const where = { userId, deletedAt: null }
    const [total, rows] = await Promise.all([
      prisma.imConversationUser.count({ where }),
      prisma.imConversationUser.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
        skip: (curPage - 1) * pageSize,
        take: pageSize
      })
    ])
    const convIds = rows.map(r => r.conversationId)
    const convs = convIds.length
      ? await prisma.imConversation.findMany({ where: { id: { in: convIds } } })
      : []
    const convMap = new Map(convs.map(c => [String(c.id), c] as const))
    const lastMsgIds = convs.map(c => c.lastMsgId).filter(Boolean) as string[]
    const lastMsgs = lastMsgIds.length
      ? await prisma.imMessage.findMany({
          where: { msgId: { in: lastMsgIds } }
        })
      : []
    const msgMap = new Map(lastMsgs.map(m => [m.msgId, m] as const))
    return serializeBigInt({
      total,
      curPage,
      pageSize,
      list: rows.map(r => {
        const conv = convMap.get(String(r.conversationId))
        const lastMsg = conv?.lastMsgId ? msgMap.get(conv.lastMsgId) : null
        return {
          ...r,
          convType: conv?.convType,
          bizId: conv?.bizId,
          maxSeq: conv?.maxSeq,
          lastMsg: lastMsg
            ? {
                msgId: lastMsg.msgId,
                msgType: lastMsg.msgType,
                content: lastMsg.content,
                senderId: lastMsg.senderId,
                serverTime: lastMsg.serverTime,
                status: lastMsg.status
              }
            : null
        }
      })
    })
  }

  /** 历史（beforeSeq 倒序分页） */
  async listMessages(
    conversationId: string,
    uid: string,
    beforeSeq?: number,
    limit = 20
  ) {
    limit = Math.min(50, Math.max(1, limit))
    const convId = BigInt(conversationId)
    await this.assertMember(convId, uid)
    const where: Record<string, unknown> = {
      conversationId: convId,
      status: { in: ['NORMAL', 'RECALLED'] }
    }
    if (beforeSeq) (where.seq as { lt: number }) = { lt: Number(beforeSeq) }
    const rows = await prisma.imMessage.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: limit
    })
    return serializeBigInt(rows.sort((a, b) => Number(a.seq - b.seq)))
  }

  /** 补洞（afterSeq 升序） */
  async syncMessages(
    conversationId: string,
    uid: string,
    afterSeq: number,
    limit = 50
  ) {
    limit = Math.min(50, Math.max(1, limit))
    const convId = BigInt(conversationId)
    await this.assertMember(convId, uid)
    const rows = await prisma.imMessage.findMany({
      where: {
        conversationId: convId,
        seq: { gt: Number(afterSeq) },
        status: { in: ['NORMAL', 'RECALLED'] }
      },
      orderBy: { seq: 'asc' },
      take: limit
    })
    return serializeBigInt(rows)
  }

  /** 已读上报：seq 单调前进；按 §4.3.1 重算未读 */
  async markRead(conversationId: string, uid: string, seq: number) {
    const convId = BigInt(conversationId)
    const userId = BigInt(uid)
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId } }
    })
    if (!cu) throw new ImException(ImErrorCode.NO_PERMISSION)
    // 仅允许 seq 单调前进
    if (seq <= Number(cu.lastReadSeq)) {
      return serializeBigInt(cu)
    }
    // 重算未读：seq > lastReadSeq 且 status=NORMAL 且 sender≠自己 的消息数
    const conv = await prisma.imConversation.findUnique({
      where: { id: convId }
    })
    const unread = conv
      ? await prisma.imMessage.count({
          where: {
            conversationId: convId,
            seq: { gt: seq },
            status: 'NORMAL',
            senderId: { not: userId }
          }
        })
      : 0
    const updated = await prisma.imConversationUser.update({
      where: { id: cu.id },
      data: {
        lastReadSeq: BigInt(seq),
        unreadCount: unread,
        mentionUnread: 0,
        updatedAt: BigInt(Date.now())
      }
    })
    return serializeBigInt(updated)
  }

  async pin(conversationId: string, uid: string, pinned: boolean) {
    const convId = BigInt(conversationId)
    const userId = BigInt(uid)
    if (pinned) {
      const pinnedCount = await prisma.imConversationUser.count({
        where: { userId, isPinned: true, deletedAt: null }
      })
      if (pinnedCount >= IM_DEFAULTS.maxPinned) {
        throw new ImException(
          ImErrorCode.NO_PERMISSION,
          `置顶不超过 ${IM_DEFAULTS.maxPinned} 个`
        )
      }
    }
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId } }
    })
    if (!cu) throw new ImException(ImErrorCode.NO_PERMISSION)
    const updated = await prisma.imConversationUser.update({
      where: { id: cu.id },
      data: { isPinned: pinned, updatedAt: BigInt(Date.now()) }
    })
    return serializeBigInt(updated)
  }

  async mute(conversationId: string, uid: string, muted: boolean) {
    const convId = BigInt(conversationId)
    const userId = BigInt(uid)
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId } }
    })
    if (!cu) throw new ImException(ImErrorCode.NO_PERMISSION)
    const updated = await prisma.imConversationUser.update({
      where: { id: cu.id },
      data: { isMuted: muted, updatedAt: BigInt(Date.now()) }
    })
    return serializeBigInt(updated)
  }

  async saveDraft(conversationId: string, uid: string, draft: string) {
    const convId = BigInt(conversationId)
    const userId = BigInt(uid)
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId } }
    })
    if (!cu) throw new ImException(ImErrorCode.NO_PERMISSION)
    const updated = await prisma.imConversationUser.update({
      where: { id: cu.id },
      data: { draft, updatedAt: BigInt(Date.now()) }
    })
    return serializeBigInt(updated)
  }

  async deleteConversation(conversationId: string, uid: string) {
    const convId = BigInt(conversationId)
    const userId = BigInt(uid)
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId } }
    })
    if (!cu) throw new ImException(ImErrorCode.NO_PERMISSION)
    const updated = await prisma.imConversationUser.update({
      where: { id: cu.id },
      data: {
        deletedAt: BigInt(Date.now()),
        unreadCount: 0,
        mentionUnread: 0,
        updatedAt: BigInt(Date.now())
      }
    })
    return serializeBigInt(updated)
  }

  async assertMember(conversationId: bigint, uid: string | number) {
    const cu = await prisma.imConversationUser.findUnique({
      where: { conversationId_userId: { conversationId, userId: BigInt(uid) } }
    })
    if (!cu || cu.deletedAt)
      throw new ImException(ImErrorCode.NO_PERMISSION, '非会话成员')
    return cu
  }
}
