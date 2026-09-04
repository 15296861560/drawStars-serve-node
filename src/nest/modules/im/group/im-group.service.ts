import { Injectable } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'
import {
  ConvType,
  GroupType,
  JoinMode,
  MemberRole,
  IM_DEFAULTS,
  WsEventType,
  TargetType
} from '../im.constants'
import { ImException, ImErrorCode } from '../im.errors'
import { ImPushBus } from '../gateway/im-push-bus'
import { ImConversationService } from '../conversation/im-conversation.service'

@Injectable()
export class ImGroupService {
  constructor(
    private readonly pushBus: ImPushBus,
    private readonly convService: ImConversationService
  ) {}

  async create(uid: string, input: Record<string, unknown>) {
    const groupId = `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const groupType = (input.groupType as string) || GroupType.PUBLIC
    const joinMode =
      groupType === GroupType.PRIVATE
        ? JoinMode.INVITE
        : (input.joinMode as string) || JoinMode.FREE
    const group = await prisma.imGroup.create({
      data: {
        groupId,
        title: String(input.title || '新群'),
        notice: (input.notice as string) || null,
        groupType,
        joinMode,
        maxMembers:
          Number(input.maxMembers) ||
          (groupType === GroupType.PUBLIC
            ? IM_DEFAULTS.publicGroupMaxMembers
            : IM_DEFAULTS.groupMaxMembers),
        ownerId: BigInt(uid),
        status: 'ACTIVE',
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now())
      }
    })
    await prisma.imGroupMember.create({
      data: {
        groupId: group.id,
        userId: BigInt(uid),
        role: MemberRole.OWNER,
        joinedAt: BigInt(Date.now())
      }
    })
    await this.convService.upsertContainer(ConvType.GROUP, groupId)
    return serializeBigInt(group)
  }

  async list(uid: string) {
    const members = await prisma.imGroupMember.findMany({
      where: { userId: BigInt(uid) }
    })
    const ids = members.map(m => m.groupId)
    const rows = ids.length
      ? await prisma.imGroup.findMany({ where: { id: { in: ids } } })
      : []
    return serializeBigInt(rows)
  }

  async get(groupId: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    return serializeBigInt(group)
  }

  async update(groupId: string, uid: string, patch: Record<string, unknown>) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    await this.assertManager(group, uid)
    const allowed: Record<string, unknown> = {}
    for (const k of ['title', 'notice', 'joinMode', 'maxMembers']) {
      if (patch[k] !== undefined) allowed[k] = patch[k]
    }
    allowed.updatedAt = BigInt(Date.now())
    const updated = await prisma.imGroup.update({
      where: { id: group.id },
      data: allowed
    })
    return serializeBigInt(updated)
  }

  async join(groupId: string, uid: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    if (group.status !== 'ACTIVE')
      throw new ImException(ImErrorCode.JOIN_DENIED)

    if (
      group.groupType === GroupType.PRIVATE ||
      group.joinMode === JoinMode.INVITE
    ) {
      throw new ImException(ImErrorCode.JOIN_DENIED, '私有群需邀请加入')
    }
    if (group.joinMode === JoinMode.APPROVE) {
      return { status: 'PENDING', groupId }
    }
    // FREE
    const count = await prisma.imGroupMember.count({
      where: { groupId: group.id }
    })
    if (count >= group.maxMembers) throw new ImException(ImErrorCode.ROOM_FULL)
    await prisma.imGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: BigInt(uid) } },
      create: {
        groupId: group.id,
        userId: BigInt(uid),
        role: MemberRole.MEMBER,
        joinedAt: BigInt(Date.now())
      },
      update: {}
    })
    await this.convService.upsertContainer(ConvType.GROUP, groupId)
    await this.convService.ensureConvUser(
      await this.convService.upsertContainer(ConvType.GROUP, groupId),
      uid
    )
    await this.pushBus.publishEvent(uid, WsEventType.MEMBER_JOIN, {
      targetType: TargetType.GROUP,
      targetId: groupId,
      userId: uid,
      role: MemberRole.MEMBER
    })
    return { status: 'ACTIVE', groupId }
  }

  async leave(groupId: string, uid: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) return { groupId }
    await prisma.imGroupMember.deleteMany({
      where: { groupId: group.id, userId: BigInt(uid) }
    })
    await this.pushBus.publishEvent(uid, WsEventType.MEMBER_LEAVE, {
      targetType: TargetType.GROUP,
      targetId: groupId,
      userId: uid
    })
    return { groupId, status: 'LEFT' }
  }

  async members(groupId: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    const rows = await prisma.imGroupMember.findMany({
      where: { groupId: group.id },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }]
    })
    return serializeBigInt(rows)
  }

  async mute(
    groupId: string,
    uid: string,
    targetUserId: string,
    duration: '10min' | '1h' | 'permanent'
  ) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    await this.assertManager(group, uid)
    const muteUntil =
      duration === 'permanent'
        ? BigInt(9999999999999)
        : BigInt(
            Date.now() +
              (duration === '10min' ? 10 * 60 * 1000 : 60 * 60 * 1000)
          )
    await prisma.imGroupMember.updateMany({
      where: { groupId: group.id, userId: BigInt(targetUserId) },
      data: { muteUntil }
    })
    await this.pushBus.publishEvent(targetUserId, WsEventType.MUTE, {
      targetType: TargetType.GROUP,
      targetId: groupId,
      muteUntil: String(muteUntil),
      operatorId: uid
    })
    return { targetUserId, muteUntil: String(muteUntil) }
  }

  async kick(groupId: string, uid: string, targetUserId: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    await this.assertManager(group, uid)
    await prisma.imGroupMember.deleteMany({
      where: { groupId: group.id, userId: BigInt(targetUserId) }
    })
    await this.pushBus.publishEvent(targetUserId, WsEventType.KICK, {
      targetType: TargetType.GROUP,
      targetId: groupId,
      operatorId: uid
    })
    return { targetUserId }
  }

  async setAdmin(
    groupId: string,
    uid: string,
    targetUserId: string,
    isAdmin: boolean
  ) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    if (String(group.ownerId) !== String(uid))
      throw new ImException(ImErrorCode.NO_PERMISSION, '仅群主可任免')
    await prisma.imGroupMember.updateMany({
      where: { groupId: group.id, userId: BigInt(targetUserId) },
      data: { role: isAdmin ? MemberRole.ADMIN : MemberRole.MEMBER }
    })
    return {
      targetUserId,
      role: isAdmin ? MemberRole.ADMIN : MemberRole.MEMBER
    }
  }

  async transfer(groupId: string, uid: string, targetUserId: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    if (String(group.ownerId) !== String(uid))
      throw new ImException(ImErrorCode.NO_PERMISSION, '仅群主可转让')
    await prisma.$transaction(async tx => {
      await tx.imGroupMember.updateMany({
        where: { groupId: group.id, userId: BigInt(uid) },
        data: { role: MemberRole.ADMIN }
      })
      await tx.imGroupMember.updateMany({
        where: { groupId: group.id, userId: BigInt(targetUserId) },
        data: { role: MemberRole.OWNER }
      })
      await tx.imGroup.update({
        where: { id: group.id },
        data: { ownerId: BigInt(targetUserId), updatedAt: BigInt(Date.now()) }
      })
    })
    return { groupId, ownerId: targetUserId }
  }

  async dissolve(groupId: string, uid: string) {
    const group = await prisma.imGroup.findUnique({ where: { groupId } })
    if (!group) throw new ImException(ImErrorCode.NO_PERMISSION, '群不存在')
    if (String(group.ownerId) !== String(uid))
      throw new ImException(ImErrorCode.NO_PERMISSION, '仅群主可解散')
    await prisma.imGroup.delete({ where: { id: group.id } })
    return { groupId, status: 'DISSOLVED' }
  }

  private async assertManager(
    group: { id: bigint; ownerId: bigint },
    uid: string
  ) {
    const m = await prisma.imGroupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: BigInt(uid) } }
    })
    if (
      String(group.ownerId) !== String(uid) &&
      m?.role !== MemberRole.ADMIN &&
      m?.role !== MemberRole.OWNER
    ) {
      throw new ImException(ImErrorCode.NO_PERMISSION, '需要管理员权限')
    }
  }
}
