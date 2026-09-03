import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { serializeBigInt } from "../../../../lib/serialize";
import { JoinStatus, IM_DEFAULTS, TargetType, MemberRole, WsEventType } from "../im.constants";
import { ImException, ImErrorCode } from "../im.errors";
import { ImPushBus } from "../gateway/im-push-bus";
import { ImConversationService } from "../conversation/im-conversation.service";

@Injectable()
export class ImJoinRequestService {
  constructor(
    private readonly pushBus: ImPushBus,
    private readonly convService: ImConversationService,
  ) {}

  /** 我发起的 / 我管理的待审列表 */
  async list(uid: string, scope: "mine" | "manage") {
    if (scope === "mine") {
      const rows = await prisma.imJoinRequest.findMany({
        where: { applicantId: BigInt(uid) },
        orderBy: { createdAt: "desc" },
      });
      return serializeBigInt(rows);
    }
    // 我管理的（房主/管理员）
    const rooms = await prisma.imRoomMember.findMany({ where: { userId: BigInt(uid), role: { in: [MemberRole.OWNER, MemberRole.ADMIN] } } });
    const groups = await prisma.imGroupMember.findMany({ where: { userId: BigInt(uid), role: { in: [MemberRole.OWNER, MemberRole.ADMIN] } } });
    const roomIds = await Promise.all(rooms.map(async (r) => (await prisma.imRoom.findUnique({ where: { id: r.roomId } }))?.roomId));
    const groupIds = await Promise.all(groups.map(async (g) => (await prisma.imGroup.findUnique({ where: { id: g.groupId } }))?.groupId));
    const targets = [
      ...roomIds.filter(Boolean).map((id) => ({ targetType: TargetType.ROOM, targetId: id as string })),
      ...groupIds.filter(Boolean).map((id) => ({ targetType: TargetType.GROUP, targetId: id as string })),
    ];
    if (!targets.length) return [];
    const orCond = targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId }));
    const rows = await prisma.imJoinRequest.findMany({ where: { OR: orCond, status: JoinStatus.PENDING }, orderBy: { createdAt: "desc" } });
    return serializeBigInt(rows);
  }

  async create(uid: string, targetType: string, targetId: string, remark?: string) {
    // 24h 内仅 1 条 PENDING
    const since = BigInt(Date.now() - 24 * 60 * 60 * 1000);
    const exist = await prisma.imJoinRequest.findFirst({
      where: { targetType, targetId, applicantId: BigInt(uid), status: JoinStatus.PENDING, createdAt: { gt: since } },
    });
    if (exist) throw new ImException(ImErrorCode.JOIN_PENDING);

    const row = await prisma.imJoinRequest.create({
      data: {
        targetType,
        targetId,
        applicantId: BigInt(uid),
        status: JoinStatus.PENDING,
        remark,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
      },
    });
    // 通知 OWNER/ADMIN
    await this.notifyManagers(targetType, targetId, uid, "NEW");
    return serializeBigInt(row);
  }

  async approve(uid: string, reqId: string) {
    const req = await prisma.imJoinRequest.findUnique({ where: { id: BigInt(reqId) } });
    if (!req || req.status !== JoinStatus.PENDING) throw new ImException(ImErrorCode.NO_PERMISSION, "无待处理申请");
    await this.assertManager(uid, req.targetType, req.targetId);

    await prisma.$transaction(async (tx) => {
      await tx.imJoinRequest.update({ where: { id: req.id }, data: { status: JoinStatus.APPROVED, handledBy: BigInt(uid), updatedAt: BigInt(Date.now()) } });
      if (req.targetType === TargetType.ROOM) {
        const room = await tx.imRoom.findUnique({ where: { roomId: req.targetId } });
        if (room) {
          await tx.imRoomMember.upsert({
            where: { roomId_userId: { roomId: room.id, userId: req.applicantId } },
            create: { roomId: room.id, userId: req.applicantId, role: MemberRole.MEMBER, joinedAt: BigInt(Date.now()) },
            update: {},
          });
        }
      } else if (req.targetType === TargetType.GROUP) {
        const group = await tx.imGroup.findUnique({ where: { groupId: req.targetId } });
        if (group) {
          await tx.imGroupMember.upsert({
            where: { groupId_userId: { groupId: group.id, userId: req.applicantId } },
            create: { groupId: group.id, userId: req.applicantId, role: MemberRole.MEMBER, joinedAt: BigInt(Date.now()) },
            update: {},
          });
        }
      }
    });
    // 创建会话 + 通知申请人
    const convType = req.targetType === TargetType.ROOM ? "ROOM" : "GROUP";
    const convId = await this.convService.upsertContainer(convType as never, req.targetId);
    await this.convService.ensureConvUser(convId, String(req.applicantId));
    await this.pushBus.publishEvent(String(req.applicantId), WsEventType.JOIN_REQUEST, { requestId: reqId, targetType: req.targetType, targetId: req.targetId, status: "APPROVED" });
    return { reqId, status: JoinStatus.APPROVED };
  }

  async reject(uid: string, reqId: string) {
    const req = await prisma.imJoinRequest.findUnique({ where: { id: BigInt(reqId) } });
    if (!req || req.status !== JoinStatus.PENDING) throw new ImException(ImErrorCode.NO_PERMISSION, "无待处理申请");
    await this.assertManager(uid, req.targetType, req.targetId);
    await prisma.imJoinRequest.update({ where: { id: req.id }, data: { status: JoinStatus.REJECTED, handledBy: BigInt(uid), updatedAt: BigInt(Date.now()) } });
    await this.pushBus.publishEvent(String(req.applicantId), WsEventType.JOIN_REQUEST, { requestId: reqId, targetType: req.targetType, targetId: req.targetId, status: "REJECTED" });
    return { reqId, status: JoinStatus.REJECTED };
  }

  async withdraw(uid: string, reqId: string) {
    const req = await prisma.imJoinRequest.findUnique({ where: { id: BigInt(reqId) } });
    if (!req || req.applicantId !== BigInt(uid)) throw new ImException(ImErrorCode.NO_PERMISSION);
    if (req.status !== JoinStatus.PENDING) throw new ImException(ImErrorCode.NO_PERMISSION, "非待处理状态");
    await prisma.imJoinRequest.update({ where: { id: req.id }, data: { status: JoinStatus.CANCELLED, updatedAt: BigInt(Date.now()) } });
    return { reqId, status: JoinStatus.CANCELLED };
  }

  private async assertManager(uid: string, targetType: string, targetId: string) {
    if (targetType === TargetType.ROOM) {
      const room = await prisma.imRoom.findUnique({ where: { roomId: targetId } });
      if (!room) throw new ImException(ImErrorCode.NO_PERMISSION);
      const m = await prisma.imRoomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: BigInt(uid) } } });
      if (String(room.ownerId) !== String(uid) && m?.role !== MemberRole.ADMIN && m?.role !== MemberRole.OWNER) {
        throw new ImException(ImErrorCode.NO_PERMISSION, "需要管理员权限");
      }
    } else if (targetType === TargetType.GROUP) {
      const group = await prisma.imGroup.findUnique({ where: { groupId: targetId } });
      if (!group) throw new ImException(ImErrorCode.NO_PERMISSION);
      const m = await prisma.imGroupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: BigInt(uid) } } });
      if (String(group.ownerId) !== String(uid) && m?.role !== MemberRole.ADMIN && m?.role !== MemberRole.OWNER) {
        throw new ImException(ImErrorCode.NO_PERMISSION, "需要管理员权限");
      }
    }
  }

  private async notifyManagers(targetType: string, targetId: string, applicantId: string, status: string) {
    const convType = targetType === TargetType.ROOM ? "ROOM" : "GROUP";
    const conv = await prisma.imConversation.findUnique({ where: { convType_bizId: { convType: convType, bizId: targetId } } });
    if (!conv) return;
    const members = targetType === TargetType.ROOM
      ? await prisma.imRoomMember.findMany({ where: { roomId: (await prisma.imRoom.findUnique({ where: { roomId: targetId } }))!.id, role: { in: [MemberRole.OWNER, MemberRole.ADMIN] } } })
      : await prisma.imGroupMember.findMany({ where: { groupId: (await prisma.imGroup.findUnique({ where: { groupId: targetId } }))!.id, role: { in: [MemberRole.OWNER, MemberRole.ADMIN] } } });
    for (const m of members) {
      if (String(m.userId) === applicantId) continue;
      await this.pushBus.publishEvent(String(m.userId), WsEventType.JOIN_REQUEST, { targetType, targetId, applicantId, status });
    }
  }
}
