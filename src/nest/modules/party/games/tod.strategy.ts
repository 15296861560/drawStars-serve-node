/**
 * 真心话大冒险 tod 策略：无服务端回合状态机的「事件直通」广播
 * 形状基线：对齐小程序 components/game/tod/tod.js 的种子同构设计——
 * - 抽人由各端 mock.pickSeed('tod_pick_<sid>_<no>') 种子同构算出，服务端不裁决
 * - 真人选「真心话 / 大冒险」(tod.pick) 与「完成 / 跳过」(tod.answer) 由行动端
 *   广播，观察端跟随渲染；answer 必带 text（各端 api.todDraw 本地防连重缓存
 *   不同，观察端不重新抽题）
 * - actorId 由服务端注入发送者 viewerKey：各端 session.players 里自己的行
 *   渲染为 'u_me'，行动端无法自报稳定 id；发送端收到的回包因解析不到槽位
 *   被前端自然丢弃，观察端按 players 列表解析，杜绝伪冒他人
 * - 服务端轻校验（PRD 8.4）：kind 合法 / done 布尔 / text ≤ 200，不合规丢弃
 *
 * 补充：缓存最近一条已广播 tod.answer（REPLAY_TTL 窗口），onMemberJoined
 * 单发给断线重连者补 reveal 位；更早缺口由下一轮事件自然收敛（tod 无需重放全集）。
 */
import type { PartySession, PartySessionPlayer } from '@prisma/client'
import { broadcastChannel } from '../../../../public/ws/ws-hub'
import type { WsMember } from '../../../../public/ws/ws-hub'
import { channelOf, clampInt, partyEnvelope } from '../party.util'
import type { GameStrategy, GameWsEvent } from './party.strategy'

const TOD_KINDS = new Set(['truth', 'dare'])
const TEXT_LIMIT = 200
/** 重连回放窗口：覆盖 reveal 10s 停驻；超窗即失效（回放旧回合反而制造串轮） */
const REPLAY_TTL_MS = 20_000

interface TodAnswerRecord {
  data: Record<string, unknown>
  at: number
}

export class TodStrategy implements GameStrategy {
  /** sessionId → 最近一条已广播 tod.answer（容量随 cleanup / TTL 收敛） */
  private readonly lastAnswers = new Map<string, TodAnswerRecord>()

  async initRound(_session: PartySession, _players: PartySessionPlayer[]): Promise<void> {
    // tod 全程由客户端种子同构 + 事件直通驱动，开局无需服务端编排
  }

  async handleWs(event: GameWsEvent): Promise<void> {
    if (event.type !== 'tod.pick' && event.type !== 'tod.answer') return
    const type = event.type
    // actorId 一律以发送者 viewerKey 为准（前端各自只能在自己被抽中时发言）
    const data: Record<string, unknown> = { ...event.data, actorId: event.viewerKey }
    if (type === 'tod.answer') {
      this.lastAnswers.set(event.sessionId, { data, at: Date.now() })
    }
    const channelId = channelOf(event.sessionId)
    broadcastChannel(channelId, () => partyEnvelope(channelId, type, data))
  }

  /** 消息合规校验（PRD 8.4：不合规抛错 → 编排层捕获并丢弃） */
  validate(event: GameWsEvent): void {
    if (event.type !== 'tod.pick' && event.type !== 'tod.answer') {
      throw new Error('非 tod 策略事件：' + event.type)
    }
    if (!clampInt(event.data.no, 1, 999, 0)) throw new Error('tod.* 缺少合法轮次 no')
    const kind = String(event.data.kind || '')
    if (!TOD_KINDS.has(kind)) throw new Error('tod.* kind 非法：' + kind)
    if (event.type === 'tod.answer') {
      if (typeof event.data.done !== 'boolean') throw new Error('tod.answer 缺少布尔 done')
      if (String(event.data.text || '').length > TEXT_LIMIT) {
        throw new Error('tod.answer text 超长')
      }
    }
  }

  async settleRound(_sessionId: string, _reason: string): Promise<void> {
    // tod 无服务端回合状态机，无强制结算可收口
  }

  /** 新成员入频道（含断线重连）：回放最近一条 answer 补 reveal 位（仅单发给本人） */
  onMemberJoined(sessionId: string, member: WsMember): void {
    const last = this.lastAnswers.get(sessionId)
    if (!last) return
    if (Date.now() - last.at > REPLAY_TTL_MS) {
      this.lastAnswers.delete(sessionId)
      return
    }
    try {
      if (member.socket.readyState === member.socket.OPEN) {
        member.socket.send(partyEnvelope(channelOf(sessionId), 'tod.answer', last.data))
      }
    } catch {
      /* 回放失败静默（PRD 8.4） */
    }
  }

  cleanup(sessionId: string): void {
    this.lastAnswers.delete(sessionId)
  }
}
