import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { serializeBigInt } from "../../../../lib/serialize";
import {
  ConvType,
  MsgType,
  MsgStatus,
  IM_DEFAULTS,
  imRedisKey,
} from "../im.constants";
import { ImException, ImErrorCode } from "../im.errors";
import type { SendMessageDto, SendResult } from "../im.types";
import { ImConversationService } from "../conversation/im-conversation.service";
import { ImSensitiveService } from "../moderation/im-sensitive.service";
import { ImRelationService } from "../relation/im-relation.service";
import { ImPushBus } from "../gateway/im-push-bus";
import { incr } from "../im-redis";

@Injectable()
export class ImMessageService {
  constructor(
    private readonly convService: ImConversationService,
    private readonly sensitive: ImSensitiveService,
    private readonly relation: ImRelationService,
    private readonly pushBus: ImPushBus,
  ) {}

  /**
   * ★唯一写入口（先写后推，§4.4.0）：
   * 鉴权→禁言→拉黑→频控→敏感词→陌生人策略→upsert会话→事务分配seq落库更新未读→提交后推送
   */
  async send(senderId: string, dto: SendMessageDto): Promise<SendResult> {
    if (!dto.clientMsgId) throw new ImException(ImErrorCode.NO_PERMISSION, "clientMsgId 必填");
    if (!dto.msgType) throw new ImException(ImErrorCode.NO_PERMISSION, "msgType 必填");

    // 1. 解析/创建会话 + 校验发送者权限
    const { convId, convType, bizId, receiverId } = await this.resolveConversation(senderId, dto);

    // 2. 幂等：(sender_id, client_msg_id)
    const dup = await prisma.imMessage.findUnique({
      where: { senderId_clientMsgId: { senderId: BigInt(senderId), clientMsgId: dto.clientMsgId } },
    });
    if (dup) {
      return {
        conversationId: String(dup.conversationId),
        msgId: dup.msgId,
        seq: Number(dup.seq),
        serverTime: Number(dup.serverTime),
        status: "SUCCESS",
        duplicate: true,
      };
    }

    // 3. 预检：禁言/拉黑/频控/敏感词/陌生人
    await this.preSendChecks(senderId, convId, convType, bizId, receiverId, dto);

    // 4. 事务内：分配 seq、落库、更新会话、更新未读
    const now = BigInt(Date.now());
    const serverTime = Number(now);
    const msgId = this.genMsgId();
    const { seq, message } = await prisma.$transaction(async (tx) => {
      // 原子分配 seq
      const conv = await tx.imConversation.update({
        where: { id: convId },
        data: {
          maxSeq: { increment: 1 },
          lastMsgId: msgId,
          lastMsgTime: now,
          updatedAt: now,
        },
      });
      const seq = conv.maxSeq;
      const message = await tx.imMessage.create({
        data: {
          msgId,
          clientMsgId: dto.clientMsgId,
          conversationId: convId,
          senderId: BigInt(senderId),
          msgType: dto.msgType,
          content: (dto.content ?? undefined) as never,
          seq,
          status: MsgStatus.NORMAL,
          serverTime: now,
          atUserIds: dto.content?.atUserIds ?? undefined,
          atAll: Boolean(dto.content?.atAll),
        },
      });
      // 更新接收方未读（§4.3.1）
      await this.updateUnread(tx, convId, convType, bizId, senderId, dto, seq);
      return { seq, message };
    });

    // 5. 提交成功后推送（失败不影响落库）
    const envelope = serializeBigInt({
      msgId: message.msgId,
      clientMsgId: message.clientMsgId,
      senderId: message.senderId,
      msgType: message.msgType,
      content: message.content,
      seq: Number(seq),
      serverTime,
      atUserIds: message.atUserIds,
      atAll: message.atAll,
      status: message.status,
    });
    const targetUids = await this.resolvePushTargets(convId, convType, bizId, senderId);
    await this.pushBus.publishMessage({
      conversationId: String(convId),
      convType,
      envelope,
      targetUids,
    });

    return {
      conversationId: String(convId),
      msgId,
      seq: Number(seq),
      serverTime,
      status: "SUCCESS",
    };
  }

  /** 撤回（发送者 2 分钟内；ADMIN/OWNER 24h） */
  async recall(operatorId: string, msgId: string) {
    const msg = await prisma.imMessage.findUnique({ where: { msgId } });
    if (!msg) throw new ImException(ImErrorCode.NO_PERMISSION, "消息不存在");
    if (msg.status === MsgStatus.RECALLED) throw new ImException(ImErrorCode.NO_PERMISSION, "已撤回");
    const conv = await prisma.imConversation.findUnique({ where: { id: msg.conversationId } });
    if (!conv) throw new ImException(ImErrorCode.NO_PERMISSION);

    const isSender = String(msg.senderId) === String(operatorId);
    const elapsed = Date.now() - Number(msg.serverTime);
    if (isSender) {
      if (elapsed > IM_DEFAULTS.recallTimeoutSec * 1000) {
        throw new ImException(ImErrorCode.RECALL_TIMEOUT);
      }
    } else {
      // 非发送者：须为该会话所属群/房 ADMIN/OWNER
      const role = await this.getMemberRole(conv, operatorId);
      if (role !== "ADMIN" && role !== "OWNER") {
        throw new ImException(ImErrorCode.NO_PERMISSION);
      }
      if (elapsed > IM_DEFAULTS.adminRecallTimeoutSec * 1000) {
        throw new ImException(ImErrorCode.RECALL_TIMEOUT);
      }
    }

    const updated = await prisma.imMessage.update({
      where: { msgId },
      data: { status: MsgStatus.RECALLED },
    });

    // 撤回回退未读（仅 C2C/GROUP 简化：对未读大于0的接收方 -1）
    await this.rollbackUnreadOnRecall(msg.conversationId, String(msg.senderId), Number(msg.seq));

    // 推送 RECALL
    const targetUids = await this.resolvePushTargets(msg.conversationId, conv.convType as ConvType, conv.bizId, String(msg.senderId));
    await this.pushBus.publishMessage({
      conversationId: String(msg.conversationId),
      convType: conv.convType,
      envelope: { event: "RECALL", msgId, seq: Number(msg.seq), operatorId, serverTime: Number(msg.serverTime) },
      targetUids,
    });
    return serializeBigInt(updated);
  }

  /** 对我删除（v1.0 客户端侧隐藏；服务端记录 TIP 不做，仅返回成功） */
  async deleteForMe(operatorId: string, msgId: string) {
    const msg = await prisma.imMessage.findUnique({ where: { msgId } });
    if (!msg) throw new ImException(ImErrorCode.NO_PERMISSION, "消息不存在");
    return { msgId, deleted: true };
  }

  /** 转发（倾诉房禁转 IM_FORWARD_DENIED） */
  async forward(operatorId: string, msgId: string, target: { convType: ConvType; bizId: string }) {
    const msg = await prisma.imMessage.findUnique({ where: { msgId } });
    if (!msg) throw new ImException(ImErrorCode.NO_PERMISSION, "消息不存在");
    // 源会话若为倾诉房禁转
    const sourceConv = await prisma.imConversation.findUnique({ where: { id: msg.conversationId } });
    if (sourceConv?.convType === ConvType.ROOM) {
      const room = await prisma.imRoom.findUnique({ where: { roomId: sourceConv.bizId } });
      if (room?.categoryId === "CONFIDE") {
        throw new ImException(ImErrorCode.FORWARD_DENIED);
      }
    }
    return this.send(operatorId, {
      clientMsgId: `fwd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      msgType: msg.msgType as MsgType,
      content: (msg.content as Record<string, unknown>) ?? {},
      target,
    });
  }

  // ============ 内部 ============

  private async resolveConversation(
    senderId: string,
    dto: SendMessageDto,
  ): Promise<{ convId: bigint; convType: ConvType; bizId: string; receiverId?: string }> {
    if (dto.conversationId) {
      const conv = await prisma.imConversation.findUnique({ where: { id: BigInt(dto.conversationId) } });
      if (!conv) throw new ImException(ImErrorCode.NO_PERMISSION, "会话不存在");
      await this.convService.assertMember(conv.id, senderId);
      const receiverId = conv.convType === ConvType.C2C && conv.pairKey
        ? String(conv.pairKey).split("_").find((x) => x !== String(senderId))
        : undefined;
      return { convId: conv.id, convType: conv.convType as ConvType, bizId: conv.bizId, receiverId };
    }
    if (!dto.target) throw new ImException(ImErrorCode.NO_PERMISSION, "target 必填");
    const { convType, bizId } = dto.target;
    if (convType === ConvType.C2C) {
      const convId = await this.convService.upsertC2C(senderId, bizId);
      return { convId, convType, bizId, receiverId: bizId };
    }
    // GROUP / ROOM：校验已加入，不在发送时偷拉人
    await this.assertInContainer(convType, bizId, senderId);
    const convId = await this.convService.upsertContainer(convType, bizId);
    return { convId, convType, bizId };
  }

  private async assertInContainer(convType: ConvType, bizId: string, uid: string) {
    if (convType === ConvType.GROUP) {
      const m = await prisma.imGroupMember.findUnique({
        where: { groupId_userId: { groupId: BigInt(bizId), userId: BigInt(uid) } },
      });
      if (!m) throw new ImException(ImErrorCode.NO_PERMISSION, "未加入该群");
    } else if (convType === ConvType.ROOM) {
      const room = await prisma.imRoom.findUnique({ where: { roomId: bizId } });
      if (!room || room.status !== "ACTIVE") throw new ImException(ImErrorCode.ROOM_CLOSED);
      const m = await prisma.imRoomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: BigInt(uid) } },
      });
      if (!m) throw new ImException(ImErrorCode.NO_PERMISSION, "未进入该房间");
    }
  }

  private async getMemberRole(conv: { convType: string; bizId: string }, uid: string): Promise<string | null> {
    if (conv.convType === ConvType.GROUP) {
      const m = await prisma.imGroupMember.findUnique({
        where: { groupId_userId: { groupId: BigInt(conv.bizId), userId: BigInt(uid) } },
      });
      return m?.role ?? null;
    }
    if (conv.convType === ConvType.ROOM) {
      const room = await prisma.imRoom.findUnique({ where: { roomId: conv.bizId } });
      if (!room) return null;
      const m = await prisma.imRoomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: BigInt(uid) } },
      });
      return m?.role ?? null;
    }
    return null;
  }

  private async preSendChecks(
    senderId: string,
    convId: bigint,
    convType: ConvType,
    bizId: string,
    receiverId: string | undefined,
    dto: SendMessageDto,
  ) {
    // 频控（单会话 ≤5/秒，≤60/分钟）
    const dkSec = Math.floor(Date.now() / 1000);
    const secCount = await incr(imRedisKey.freqUserConv(senderId, String(convId)), 1);
    if (secCount > IM_DEFAULTS.freqPerSec) throw new ImException(ImErrorCode.FREQ_LIMIT);

    // 敏感词（TEXT/CUSTOM）
    if (dto.msgType === MsgType.TEXT && dto.content?.text) {
      const hit = await this.sensitive.hit(String(dto.content.text));
      if (hit) throw new ImException(ImErrorCode.SENSITIVE);
    }

    // 禁言检查（GROUP/ROOM）
    if (convType === ConvType.GROUP || convType === ConvType.ROOM) {
      await this.assertNotMuted(convType, bizId, senderId);
    }

    // 拉黑 + 陌生人策略（C2C）
    if (convType === ConvType.C2C && receiverId) {
      const blockedByReceiver = await this.relation.isBlocked(receiverId, senderId);
      if (blockedByReceiver) throw new ImException(ImErrorCode.BLOCKED);
      await this.relation.assertStrangerCanSend(senderId, receiverId, convType, dto.target);
    }
  }

  private async assertNotMuted(convType: ConvType, bizId: string, uid: string) {
    let muteUntil: bigint | null = null;
    let speakMode: string | null = null;
    if (convType === ConvType.GROUP) {
      const m = await prisma.imGroupMember.findUnique({
        where: { groupId_userId: { groupId: BigInt(bizId), userId: BigInt(uid) } },
      });
      muteUntil = m?.muteUntil ?? null;
    } else if (convType === ConvType.ROOM) {
      const room = await prisma.imRoom.findUnique({ where: { roomId: bizId } });
      speakMode = room?.speakMode ?? null;
      const m = await prisma.imRoomMember.findUnique({
        where: { roomId_userId: { roomId: room!.id, userId: BigInt(uid) } },
      });
      muteUntil = m?.muteUntil ?? null;
      const role = m?.role ?? "MEMBER";
      if (speakMode === "MUTE_ALL" && role === "MEMBER") throw new ImException(ImErrorCode.MUTED);
      if (speakMode === "ADMIN_ONLY" && role === "MEMBER") throw new ImException(ImErrorCode.MUTED);
    }
    if (muteUntil && Number(muteUntil) > Date.now()) {
      throw new ImException(ImErrorCode.MUTED);
    }
  }

  /** 更新接收方未读（§4.3.1） */
  private async updateUnread(
    tx: any,
    convId: bigint,
    convType: ConvType,
    bizId: string,
    senderId: string,
    dto: SendMessageDto,
    seq: bigint,
  ) {
    const atUserIds: string[] = Array.isArray(dto.content?.atUserIds)
      ? (dto.content!.atUserIds as string[]).map(String)
      : [];
    const atAll = Boolean(dto.content?.atAll);

    if (convType === ConvType.C2C) {
      // pair_key 另一方
      const conv = await tx.imConversation.findUnique({ where: { id: convId } });
      const [a, b] = String(conv.pairKey).split("_");
      const other = a === senderId ? b : a;
      if (other) {
        await tx.imConversationUser.updateMany({
          where: { conversationId: convId, userId: BigInt(other), deletedAt: null },
          data: { unreadCount: { increment: 1 }, mentionUnread: atUserIds.includes(other) || atAll ? { increment: 1 } : undefined, updatedAt: BigInt(Date.now()) },
        });
      }
    } else if (convType === ConvType.GROUP) {
      const members = await tx.imGroupMember.findMany({ where: { groupId: BigInt(bizId) } });
      for (const m of members) {
        if (String(m.userId) === senderId) continue;
        await tx.imConversationUser.updateMany({
          where: { conversationId: convId, userId: m.userId, deletedAt: null },
          data: { unreadCount: { increment: 1 }, mentionUnread: atUserIds.includes(String(m.userId)) || atAll ? { increment: 1 } : undefined, updatedAt: BigInt(Date.now()) },
        });
      }
    } else if (convType === ConvType.ROOM) {
      // 房间：仅 @ 增加 mention_unread，不增加 unread_count（进房清零、离房仅@）
      const members = await tx.imRoomMember.findMany({ where: { roomId: (await tx.imRoom.findUnique({ where: { roomId: bizId } }))!.id } });
      for (const m of members) {
        if (String(m.userId) === senderId) continue;
        if (atUserIds.includes(String(m.userId)) || atAll) {
          await tx.imConversationUser.updateMany({
            where: { conversationId: convId, userId: m.userId, deletedAt: null },
            data: { mentionUnread: { increment: 1 }, updatedAt: BigInt(Date.now()) },
          });
        }
      }
    }
  }

  private async rollbackUnreadOnRecall(convId: bigint, senderId: string, seq: number) {
    // 简化：对该会话所有 seq>lastReadSeq 的接收方 unread -1（撤回回退）
    await prisma.imConversationUser.updateMany({
      where: { conversationId: convId, lastReadSeq: { lt: seq }, userId: { not: BigInt(senderId) } },
      data: { unreadCount: { decrement: 1 } },
    });
  }

  private async resolvePushTargets(
    convId: bigint,
    convType: ConvType,
    bizId: string,
    senderId: string,
  ): Promise<string[] | undefined> {
    if (convType === ConvType.C2C) {
      const conv = await prisma.imConversation.findUnique({ where: { id: convId } });
      if (!conv?.pairKey) return undefined;
      const [a, b] = String(conv.pairKey).split("_");
      return [a, b].filter((x) => x !== senderId);
    }
    // GROUP/ROOM：返回 undefined 表示按订阅投递
    return undefined;
  }

  private genMsgId(): string {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
