/**
 * 事件直通广播通用基类（lady / tod / bluff / dice 共用范式）
 * 形状基线：对齐小程序各游戏子视图的「种子同构 + 事件直通」设计——
 * - 回合推进由各端种子同构算出，服务端不裁决、无状态机
 * - 真人动作（抽牌 / 作答 / 投票 / 叫点…）由行动端广播，观察端跟随渲染
 * - actorId 由服务端注入发送者 viewerKey：各端 session.players 自己那行渲染为
 *   'u_me'，发送端收到的回包解析不到槽位被前端自然丢弃，杜绝伪冒他人
 * - 服务端轻校验（PRD 8.4）：类型白名单 + 前缀 + 负载大小 + check 钩子，不合规丢弃
 *
 * 补充：按到达序缓存最近 REPLAY_CAP 条已广播事件（REPLAY_TTL_MS 窗口），
 * onMemberJoined 单发给断线重连者对齐进度；超窗条目自然失效。
 */
import type { PartySession, PartySessionPlayer } from '@prisma/client'
import { broadcastChannel, channelSize } from '../../../../public/ws/ws-hub'
import type { WsMember } from '../../../../public/ws/ws-hub'
import { channelOf, partyEnvelope } from '../party.util'
import type { GameStrategy, GameWsEvent } from './party.strategy'

/** 负载序列化上限：超过即视为不合规丢弃 */
const PAYLOAD_LIMIT = 3000
/** 重连回放窗口：远超一个停驻期的旧事件回放只会制造串轮 */
const REPLAY_TTL_MS = 20_000
/** 每会话回放容量：最近若干条足够对齐「当前停驻位」 */
const REPLAY_CAP = 6

export interface RelayConfig {
  /** 事件类型白名单（须全部以 `${gameType}.` 为前缀） */
  gameType: string
  events: string[]
  /** 参与断线重连回放的事件（缺省 = events 全量） */
  replayEvents?: string[]
  /** 各事件的额外合规校验：抛错即整条丢弃 */
  check?: (type: string, data: Record<string, unknown>) => void
}

interface RelayItem {
  type: string
  data: Record<string, unknown>
  at: number
}

export class RelayStrategy implements GameStrategy {
  protected readonly cfg: RelayConfig
  /** sessionId → 回放队列（到达序） */
  private readonly replay = new Map<string, RelayItem[]>()

  constructor(cfg: RelayConfig) {
    this.cfg = cfg
    for (const t of cfg.events) {
      if (!t.startsWith(cfg.gameType + '.')) throw new Error('relay 事件未按前缀命名：' + t)
    }
  }

  async initRound(_session: PartySession, _players: PartySessionPlayer[]): Promise<void> {
    // 直通策略全程由客户端种子同构 + 事件广播驱动，开局无需服务端编排
  }

  async handleWs(event: GameWsEvent): Promise<void> {
    if (this.cfg.events.indexOf(event.type) === -1) return
    // actorId 一律以发送者 viewerKey 为准（前端各自只能在轮到自己时发言）
    const data: Record<string, unknown> = { ...event.data, actorId: event.viewerKey }
    const replayOn =
      (this.cfg.replayEvents ? this.cfg.replayEvents : this.cfg.events).indexOf(event.type) !== -1
    if (replayOn) {
      const list = (this.replay.get(event.sessionId) || []).filter(
        (i) => Date.now() - i.at <= REPLAY_TTL_MS,
      )
      list.push({ type: event.type, data, at: Date.now() })
      while (list.length > REPLAY_CAP) list.shift()
      this.replay.set(event.sessionId, list)
    }
    const channelId = channelOf(event.sessionId)
    const total = channelSize(channelId)
    const sent = broadcastChannel(channelId, () => partyEnvelope(channelId, event.type, data))
    // 投递 n/房间 m：m 偏小=对端 WS 未入频道（前端连接问题）；n<m=有连接非 OPEN（半开）
    console.log(
      `[ws] relay ${event.type} -> ${channelId} | 投递=${sent}/${total} | actor=${event.viewerKey}`,
    )
  }

  /** 消息合规校验（PRD 8.4：不合规抛错 → 编排层捕获并丢弃） */
  validate(event: GameWsEvent): void {
    if (this.cfg.events.indexOf(event.type) === -1) {
      throw new Error('非 ' + this.cfg.gameType + ' 策略事件：' + event.type)
    }
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      throw new Error(this.cfg.gameType + '.* 负载非法')
    }
    let size = 0
    try {
      size = JSON.stringify(event.data).length
    } catch {
      throw new Error(this.cfg.gameType + '.* 负载不可序列化')
    }
    if (size > PAYLOAD_LIMIT) throw new Error(this.cfg.gameType + '.* 负载超长')
    if (this.cfg.check) this.cfg.check(event.type, event.data)
  }

  async settleRound(_sessionId: string, _reason: string): Promise<void> {
    // 直通策略无服务端回合状态机，无强制结算可收口
  }

  /** 新成员入频道（含断线重连）：按到达序单发最近事件对齐进度（仅单发给本人） */
  onMemberJoined(sessionId: string, member: WsMember): void {
    const list = this.replay.get(sessionId)
    if (!list || !list.length) return
    const fresh = list.filter((i) => Date.now() - i.at <= REPLAY_TTL_MS)
    if (fresh.length === list.length) {
      this.sendReplay(sessionId, member, fresh)
      return
    }
    if (fresh.length) {
      this.replay.set(sessionId, fresh)
    } else {
      this.replay.delete(sessionId)
    }
    this.sendReplay(sessionId, member, fresh)
  }

  private sendReplay(sessionId: string, member: WsMember, list: RelayItem[]): void {
    if (!list.length) return
    try {
      if (member.socket.readyState === member.socket.OPEN) {
        const channelId = channelOf(sessionId)
        for (const item of list) {
          member.socket.send(partyEnvelope(channelId, item.type, item.data))
        }
        console.log(`[ws] replay ${list.length} 条 -> ${member.clientKey} | ${channelId}（重连对齐）`)
      }
    } catch (err) {
      console.warn('[ws] replay 发送失败：' + (err as Error).message)
    }
  }

  cleanup(sessionId: string): void {
    this.replay.delete(sessionId)
  }
}
