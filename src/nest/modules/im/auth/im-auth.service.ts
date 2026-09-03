import crypto from "crypto";
import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { serializeBigInt } from "../../../../lib/serialize";
import { buildUserToken } from "../../../../lib/access-token-service";
import { IM_DEFAULTS, imRedisKey, PresenceStatus } from "../im.constants";
import { ImException, ImErrorCode } from "../im.errors";
import { setEx, consume } from "../im-redis";

const TICKET_SECRET =
  process.env.IM_TICKET_SECRET || "drawstars-im-ticket-secret-dev";

function hmacSign(payload: string): string {
  return crypto.createHmac("sha256", TICKET_SECRET).update(payload).digest("hex");
}

/**
 * 签发/校验 IM 鉴权凭证：
 * - Access Token 复用平台 buildUserToken（IM userId === 平台 userId，单点登录）
 * - WS Ticket：短时（≤2min）HMAC 票据，Redis 标记单次有效
 */
@Injectable()
export class ImAuthService {
  /** 签发 Access Token（需已登录平台，传入 uid） */
  issueAccessToken(uid: string | number): string {
    const token = buildUserToken(uid);
    if (!token) {
      throw new ImException(ImErrorCode.AUTH_EXPIRED, "凭证服务未就绪");
    }
    return token;
  }

  /** 签发短时 WS Ticket（≤2min，单次有效） */
  async issueWsTicket(uid: string | number): Promise<string> {
    const ticket = crypto.randomBytes(24).toString("hex");
    const payload = `${uid}:${Date.now()}`;
    const sig = hmacSign(payload);
    const body = JSON.stringify({ uid: String(uid), payload, sig });
    await setEx(imRedisKey.wsTicket(ticket), body, IM_DEFAULTS.wsTicketTtlSec);
    return ticket;
  }

  /** 校验并消费 WS Ticket（单次有效） */
  async consumeWsTicket(ticket: string): Promise<string> {
    const body = await consume(imRedisKey.wsTicket(ticket));
    if (!body) {
      throw new ImException(ImErrorCode.AUTH_EXPIRED, "WS 票据无效或已过期");
    }
    let parsed: { uid?: string; payload?: string; sig?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ImException(ImErrorCode.AUTH_EXPIRED, "WS 票据无效");
    }
    if (!parsed.uid || !parsed.payload || !parsed.sig) {
      throw new ImException(ImErrorCode.AUTH_EXPIRED, "WS 票据无效");
    }
    const expected = hmacSign(parsed.payload);
    if (expected !== parsed.sig) {
      throw new ImException(ImErrorCode.AUTH_EXPIRED, "WS 票据无效");
    }
    return parsed.uid;
  }

  /** 获取/创建 IM 用户资料 */
  async getOrCreateProfile(uid: string | number) {
    const userId = BigInt(uid);
    let profile = await prisma.imUserProfile.findUnique({ where: { userId } });
    if (!profile) {
      profile = await prisma.imUserProfile.create({
        data: {
          userId,
          status: PresenceStatus.OFFLINE,
          updatedAt: BigInt(Date.now()),
        },
      });
    }
    return profile;
  }

  /**
   * 读取 IM 资料，并把 User 表的基础身份信息（昵称/头像/性别/简介）合并进来。
   * 基础身份字段以 User 表为单一数据源，ImUserProfile 不再独立维护其副本。
   */
  async getProfile(uid: string | number) {
    const userId = BigInt(uid);
    const [profile, user] = await Promise.all([
      this.getOrCreateProfile(uid),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    const base = serializeBigInt(profile) as Record<string, unknown>;
    return {
      ...base,
      // 基础身份字段：数据源为 User 表（只读展示）
      nick: user?.name || "",
      avatar: user?.avatar || null,
      gender: user?.gender || "UNKNOWN",
      signature: user?.introduction || profile.signature || "",
      // 基础身份是否可编辑标记（前端据此把基础字段置为只读并引导去个人中心）
      baseEditable: false,
    };
  }

  async updateProfile(uid: string | number, patch: Record<string, unknown>) {
    const userId = BigInt(uid);
    await this.getOrCreateProfile(uid);

    // IM 专属字段写入 im_user_profile
    const imFields: Record<string, unknown> = {};
    for (const k of ["signature", "allowStrangerMsg", "showOnline", "extra"]) {
      if (patch[k] !== undefined) imFields[k] = patch[k];
    }
    if (Array.isArray(patch.tags)) imFields.tags = patch.tags;

    // 基础身份字段（nick/avatar/gender）若被提交，回写 User 表，保持单一数据源
    const userFields: Record<string, unknown> = {};
    if (patch.nick !== undefined) userFields.name = String(patch.nick);
    if (patch.avatar !== undefined) userFields.avatar = patch.avatar || null;
    if (patch.gender !== undefined) userFields.gender = String(patch.gender);

    if (Object.keys(userFields).length) {
      userFields.updateTime = BigInt(Date.now());
      await prisma.user.update({ where: { id: userId }, data: userFields });
    }

    if (Object.keys(imFields).length === 0) {
      // 仅更新了基础身份或无字段，直接回读合并资料
      return this.getProfile(uid);
    }
    imFields.updatedAt = BigInt(Date.now());
    await prisma.imUserProfile.update({ where: { userId }, data: imFields });
    return this.getProfile(uid);
  }

  /** 批量查询用户在线状态（隐身对非好友展示为离线，简化：直接读 presence） */
  async batchStatus(uid: string | number, targetUids: string[]) {
    const result: Record<string, string> = {};
    for (const t of targetUids) {
      if (!/^\d+$/.test(String(t))) continue;
      const profile = await prisma.imUserProfile.findUnique({ where: { userId: BigInt(t) } });
      result[t] = profile?.status || PresenceStatus.OFFLINE;
    }
    return result;
  }
}
