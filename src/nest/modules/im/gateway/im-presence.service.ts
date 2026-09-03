import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { PresenceStatus, imRedisKey } from "../im.constants";
import { sAdd, sRem, sCard } from "../im-redis";

/**
 * ImPresenceService：在线状态 + 房间停留。
 * 进程内：connRegistry（uid → ConnContext[]）；房间在线用 Redis Set。
 */
@Injectable()
export class ImPresenceService {
  /** uid → 在线连接上下文（多 Tab 仅一活跃，旧连接被互踢后移除） */
  private connRegistry = new Map<string, Set<string>>(); // uid -> Set<connId>

  registerConn(uid: string, connId: string) {
    if (!this.connRegistry.has(uid)) this.connRegistry.set(uid, new Set());
    this.connRegistry.get(uid)!.add(connId);
  }

  unregisterConn(uid: string, connId: string) {
    const set = this.connRegistry.get(uid);
    if (!set) return;
    set.delete(connId);
    if (set.size === 0) this.connRegistry.delete(uid);
  }

  isOnline(uid: string): boolean {
    const set = this.connRegistry.get(uid);
    return !!set && set.size > 0;
  }

  /** 进房：加入房间在线集合 */
  async joinRoom(uid: string, roomId: string) {
    await sAdd(imRedisKey.roomOnline(roomId), uid);
  }

  /** 离房：移出房间在线集合 */
  async leaveRoom(uid: string, roomId: string) {
    await sRem(imRedisKey.roomOnline(roomId), uid);
  }

  async getRoomOnlineCount(roomId: string): Promise<number> {
    return sCard(imRedisKey.roomOnline(roomId));
  }

  /** 更新 IM 用户呈现状态（写 profile.status） */
  async setPresenceStatus(uid: string, status: PresenceStatus) {
    try {
      await prisma.imUserProfile.update({
        where: { userId: BigInt(uid) },
        data: { status, updatedAt: BigInt(Date.now()) },
      });
    } catch {
      /* profile 可能尚未创建，忽略 */
    }
  }
}
