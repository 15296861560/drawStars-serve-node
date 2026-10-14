/**
 * party 游戏编排服务：WS 网关 + 策略注册与路由 + 会话元数据 TTL 缓存
 * - 实现 PartyWsGateway（main.ts bootstrap 后经 party-ws-bridge 静态插槽绑定到 wsServer）
 * - draw.delta 高频消息走 3s TTL 会话缓存，防每条查库（PRD 8.1 WS p95 ≤150ms）
 * - 事件投递链：wsServer 信封解析 → bridge → 本路由 → strategy.validate（不合规丢弃，PRD 8.4）→ strategy.handleWs
 * - 生命周期挂接：session.service hostAction('start') → onSessionStart；hostAction('close') → onSessionClose
 */
import { Injectable } from '@nestjs/common'
import type { PartySession, PartySessionPlayer } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import type { PartyWsGateway, PartyWsEnvelope } from '../../../../public/ws/party-ws-bridge'
import type { WsMember } from '../../../../public/ws/ws-hub'
import { sessionIdOf } from '../party.util'
import { DrawStrategy } from './draw.strategy'
import { GAME_STRATEGIES, registerGameStrategy } from './party.strategy'
import type { GameWsEvent } from './party.strategy'

const SESSION_CACHE_TTL_MS = 3000
const SESSION_CACHE_CAP = 200

interface SessionMeta {
  status: string
  gameType: string
}

@Injectable()
export class PartyGameService implements PartyWsGateway {
  /** sessionId → 元数据快照（3s TTL + FIFO 容量保护） */
  private readonly sessionCache = new Map<string, { meta: SessionMeta; at: number }>()

  constructor(private readonly prisma: PrismaService) {
    // 运行时注册策略实例（REGISTRY 顶层仅定义 Map，规避模块顶层求值时序）
    registerGameStrategy('draw', new DrawStrategy(prisma))
  }

  /* ---------- 会话元数据（高频路径缓存） ---------- */

  private async sessionMetaOf(sessionId: string): Promise<SessionMeta | null> {
    const cached = this.sessionCache.get(sessionId)
    if (cached && Date.now() - cached.at < SESSION_CACHE_TTL_MS) return cached.meta
    const session = await this.prisma.client.partySession.findUnique({
      where: { id: sessionId },
      select: { status: true, gameType: true },
    })
    if (!session) return null
    const meta: SessionMeta = { status: session.status, gameType: session.gameType }
    this.sessionCache.set(sessionId, { meta, at: Date.now() })
    while (this.sessionCache.size > SESSION_CACHE_CAP) {
      const oldest = this.sessionCache.keys().next().value
      if (oldest === undefined) break
      this.sessionCache.delete(oldest)
    }
    return meta
  }

  /* ---------- PartyWsGateway：频道新成员（回放钩子） ---------- */

  onMemberJoined(member: WsMember): void {
    const sessionId = sessionIdOf(member.channelId)
    if (!sessionId) return
    void this.sessionMetaOf(sessionId)
      .then(meta => {
        if (!meta || meta.status !== 'PLAYING') return
        GAME_STRATEGIES.get(meta.gameType)?.onMemberJoined?.(sessionId, member)
      })
      .catch(() => {})
  }

  /* ---------- PartyWsGateway：成员消息（策略域事件路由） ---------- */

  onMemberMessage(member: WsMember, envelope: PartyWsEnvelope): void {
    const sessionId = sessionIdOf(member.channelId)
    if (!sessionId) return
    const event: GameWsEvent = {
      sessionId,
      viewerKey: member.clientKey,
      type: String(envelope.type || ''),
      data:
        envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
          ? (envelope.data as Record<string, unknown>)
          : {},
    }
    void this.sessionMetaOf(sessionId)
      .then(async meta => {
        if (!meta || meta.status !== 'PLAYING') return
        const strategy = GAME_STRATEGIES.get(meta.gameType)
        if (!strategy) return
        try {
          strategy.validate(event) // PRD 8.4：不合规直接丢弃
        } catch {
          return
        }
        await strategy.handleWs(event)
      })
      .catch(() => {})
  }

  /* ---------- 会话生命周期钩子（session.service start / close 挂接） ---------- */

  /** 开局编排（hostAction start 已置 PLAYING 后调用） */
  async onSessionStart(session: PartySession, players: PartySessionPlayer[]): Promise<void> {
    // 状态刚翻转：立即失效缓存，防止 3s TTL 内旧 WAITING 快照拦下首批事件
    this.sessionCache.delete(session.id)
    const strategy = GAME_STRATEGIES.get(session.gameType)
    if (!strategy) return
    try {
      await strategy.initRound(session, players)
    } catch {
      /* 开局编排失败静默，不阻 start 响应（策略内部自带状态兜底） */
    }
  }

  /** 会话关闭：清空全部策略运行时 + 元数据缓存 */
  onSessionClose(sessionId: string): void {
    for (const strategy of GAME_STRATEGIES.values()) strategy.cleanup?.(sessionId)
    this.sessionCache.delete(sessionId)
  }
}
