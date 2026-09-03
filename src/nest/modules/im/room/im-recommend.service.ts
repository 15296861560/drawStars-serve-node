import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { serializeBigInt } from "../../../../lib/serialize";
import { ImPresenceService } from "../gateway/im-presence.service";

/**
 * 推荐排序（PRD §4.5.5）：
 * score = 0.4*norm(onlineCount) + 0.3*norm(msgCount1h) + 0.2*interestOverlap + 0.1*officialBoost
 */
@Injectable()
export class ImRecommendService {
  constructor(private readonly presence: ImPresenceService) {}

  async recommend(uid: string, categoryId?: string, keyword?: string, curPage = 1, pageSize = 20) {
    const where: Record<string, unknown> = { status: "ACTIVE" };
    if (categoryId) where.categoryId = categoryId;

    // 倾诉房仅精确房号或已加入可见
    if (keyword) {
      if (categoryId === "CONFIDE") {
        where.roomId = keyword;
      } else {
        where.OR = [{ title: { contains: keyword } }, { roomId: keyword }];
      }
    }
    // 倾诉分类默认不进全局热门（除非显式筛选）
    if (!categoryId) {
      where.categoryId = { not: "CONFIDE" };
    }

    const rooms = await prisma.imRoom.findMany({ where, orderBy: { createdAt: "desc" } });

    // 用户 tags
    const profile = await prisma.imUserProfile.findUnique({ where: { userId: BigInt(uid) } });
    const userTags: string[] = (profile?.tags as string[]) || [];

    // 近 1 小时消息量
    const since = BigInt(Date.now() - 60 * 60 * 1000);
    const msgCounts = await this.countMsgPerRoom(rooms, since);
    const maxMsg = Math.max(1, ...msgCounts.values());

    // 在线人数
    const onlineList = await Promise.all(rooms.map((r) => this.presence.getRoomOnlineCount(r.roomId)));
    const maxOnline = Math.max(1, ...onlineList);

    const scored = rooms.map((r, i) => {
      const online = onlineList[i] || 0;
      const msg1h = msgCounts.get(r.roomId) || 0;
      const normOnline = online / maxOnline;
      const normMsg = msg1h / maxMsg;
      const interestOverlap = this.jaccard(userTags, (r.tags as string[]) || []);
      const officialBoost = r.official ? 1 : 0;
      const coldStart = Date.now() - Number(r.createdAt || 0) < 24 * 60 * 60 * 1000 ? 0.05 : 0;
      const manual = Number(r.manualWeight) || 1;
      const score = (0.4 * normOnline + 0.3 * normMsg + 0.2 * interestOverlap + 0.1 * officialBoost + coldStart) * manual;
      return { room: serializeBigInt({ ...r, onlineCount: online, msgCount1h: msg1h }), score };
    });
    scored.sort((a, b) => b.score - a.score);

    const start = (curPage - 1) * pageSize;
    return { list: scored.slice(start, start + pageSize).map((s) => s.room), total: scored.length, curPage, pageSize };
  }

  private async countMsgPerRoom(rooms: { roomId: string }[], since: bigint): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (const r of rooms) {
      const conv = await prisma.imConversation.findUnique({ where: { convType_bizId: { convType: "ROOM", bizId: r.roomId } } });
      if (!conv) {
        map.set(r.roomId, 0);
        continue;
      }
      const c = await prisma.imMessage.count({ where: { conversationId: conv.id, serverTime: { gt: since } } });
      map.set(r.roomId, c);
    }
    return map;
  }

  private jaccard(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    const union = sa.size + sb.size - inter;
    return union === 0 ? 0 : inter / union;
  }
}
