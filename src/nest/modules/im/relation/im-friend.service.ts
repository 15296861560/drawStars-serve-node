import { Injectable } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'
import { FriendStatus, IM_DEFAULTS, WsEventType } from '../im.constants'
import { ImException, ImErrorCode } from '../im.errors'
import { ImPushBus } from '../gateway/im-push-bus'

@Injectable()
export class ImFriendService {
  constructor(private readonly pushBus: ImPushBus) {}

  async list(uid: string) {
    const rows = await prisma.imFriendship.findMany({
      where: { userId: BigInt(uid), status: FriendStatus.ACCEPTED }
    })
    return serializeBigInt(rows)
  }

  /** 好友申请（状态机 §4.2.4；被拒 7 日冷却） */
  async request(uid: string, friendId: string, remark?: string) {
    if (uid === friendId)
      throw new ImException(ImErrorCode.NO_PERMISSION, '不能添加自己')
    const exist = await prisma.imFriendship.findUnique({
      where: {
        userId_friendId: { userId: BigInt(uid), friendId: BigInt(friendId) }
      }
    })
    if (exist) {
      if (exist.status === FriendStatus.ACCEPTED)
        throw new ImException(ImErrorCode.NO_PERMISSION, '已是好友')
      if (exist.status === FriendStatus.PENDING)
        throw new ImException(ImErrorCode.JOIN_PENDING, '已申请，等待对方同意')
      if (exist.status === FriendStatus.REJECTED) {
        const cooldown = IM_DEFAULTS.friendRejectCooldownSec * 1000
        if (
          exist.updatedAt &&
          Number(exist.updatedAt) + cooldown > Date.now()
        ) {
          throw new ImException(
            ImErrorCode.FREQ_LIMIT,
            '对方拒绝后 7 日内不可重复申请'
          )
        }
        // 冷却结束，重新进入 PENDING
        const updated = await prisma.imFriendship.update({
          where: { id: exist.id },
          data: {
            status: FriendStatus.PENDING,
            remark,
            updatedAt: BigInt(Date.now())
          }
        })
        await this.notifyFriendRequest(uid, friendId, 'PENDING')
        return serializeBigInt(updated)
      }
    }
    const created = await prisma.imFriendship.create({
      data: {
        userId: BigInt(uid),
        friendId: BigInt(friendId),
        status: FriendStatus.PENDING,
        remark,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now())
      }
    })
    await this.notifyFriendRequest(uid, friendId, 'PENDING')
    return serializeBigInt(created)
  }

  /** 同意/拒绝（被申请方操作；双向写 ACCEPTED） */
  async respond(uid: string, friendId: string, accept: boolean) {
    const req = await prisma.imFriendship.findUnique({
      where: {
        userId_friendId: { userId: BigInt(friendId), friendId: BigInt(uid) }
      }
    })
    if (!req || req.status !== FriendStatus.PENDING) {
      throw new ImException(ImErrorCode.NO_PERMISSION, '无待处理申请')
    }
    const status = accept ? FriendStatus.ACCEPTED : FriendStatus.REJECTED
    await prisma.$transaction(async tx => {
      await tx.imFriendship.update({
        where: { id: req.id },
        data: { status, updatedAt: BigInt(Date.now()) }
      })
      if (accept) {
        // 双向好友
        const reverse = await tx.imFriendship.findUnique({
          where: {
            userId_friendId: { userId: BigInt(uid), friendId: BigInt(friendId) }
          }
        })
        if (reverse) {
          await tx.imFriendship.update({
            where: { id: reverse.id },
            data: {
              status: FriendStatus.ACCEPTED,
              updatedAt: BigInt(Date.now())
            }
          })
        } else {
          await tx.imFriendship.create({
            data: {
              userId: BigInt(uid),
              friendId: BigInt(friendId),
              status: FriendStatus.ACCEPTED,
              createdAt: BigInt(Date.now()),
              updatedAt: BigInt(Date.now())
            }
          })
        }
      }
    })
    await this.notifyFriendResult(
      uid,
      friendId,
      accept ? 'ACCEPTED' : 'REJECTED'
    )
    return { friendId, status }
  }

  /** 撤回申请 */
  async withdraw(uid: string, friendId: string) {
    const req = await prisma.imFriendship.findUnique({
      where: {
        userId_friendId: { userId: BigInt(uid), friendId: BigInt(friendId) }
      }
    })
    if (!req || req.status !== FriendStatus.PENDING) {
      throw new ImException(ImErrorCode.NO_PERMISSION, '无待处理申请')
    }
    await prisma.imFriendship.delete({ where: { id: req.id } })
    return { friendId, status: 'NONE' }
  }

  /** 删除好友（双向解除） */
  async remove(uid: string, friendId: string) {
    await prisma.imFriendship.deleteMany({
      where: {
        OR: [
          { userId: BigInt(uid), friendId: BigInt(friendId) },
          { userId: BigInt(friendId), friendId: BigInt(uid) }
        ]
      }
    })
    return { friendId, status: 'NONE' }
  }

  /** 待处理申请（收到的） */
  async pendingReceived(uid: string) {
    const rows = await prisma.imFriendship.findMany({
      where: { friendId: BigInt(uid), status: FriendStatus.PENDING },
      orderBy: { createdAt: 'desc' }
    })
    return serializeBigInt(rows)
  }

  private async notifyFriendRequest(
    fromUid: string,
    toUid: string,
    status: string
  ) {
    await this.pushBus.publishEvent(toUid, WsEventType.FRIEND_REQUEST, {
      fromUid,
      status
    })
  }

  private async notifyFriendResult(
    toUid: string,
    fromUid: string,
    status: string
  ) {
    await this.pushBus.publishEvent(toUid, WsEventType.FRIEND_RESULT, {
      fromUid,
      status
    })
  }
}
