/**
 * 你画我猜 draw 策略：回合状态机 + 服务端判定 + per-viewer 定向广播
 * 形状基线：全部对齐小程序 components/game/draw/draw.js 实跑形状
 * - 常量镜像 draw.js：GUESS_POINTS [30,20,10]（rank≥4 得 0）/ CD 60s / all-hit 1.2s / summary 停 3.4s
 * - endRound reason 精确值：'all' | 'timeout' | 'skip'
 * - 词仅作画者视角可见（broadcastChannel make(clientKey) 定向渲染）
 * - PartyRound 明细写档 fire-and-forget，不阻塞回合推进
 *
 * 服务端补充事件（PRD 7.2.2 六事件表之外）：
 * - draw.round_summary：回合结算广播（word 明牌 + deltas 按视角 u_me 渲染）
 * - draw.replay：新成员入频道回放（PRD 4.4 最近 20s stroke 队列）
 */
import type { Prisma, PartySession, PartySessionPlayer } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { broadcastChannel } from '../../../../public/ws/ws-hub'
import type { WsMember } from '../../../../public/ws/ws-hub'
import { DRAW_THEMES, pickDrawWord } from '../data/draw-words'
import { channelOf, genId, partyEnvelope, shuffleSeed, toStringArray } from '../party.util'
import type { GameStrategy, GameWsEvent } from './party.strategy'

/* ---------- 常量（镜像 draw.js） ---------- */
const GUESS_POINTS = [30, 20, 10] // 名次对应分：第1名30/第2名20/第3名10，其余0
const PAINTER_BONUS = 20 // 每有一人猜中，作画者 +20
const TIMEOUT_PAINTER_BONUS = 10 // 超时且无人猜中，作画者保底 +10
const CD_SECONDS = 60
const TIMER_GRACE_MS = 800 // 客户端在 60s 边界发消息的容差
const ALL_HIT_DELAY_MS = 1200
const SUMMARY_HOLD_MS = 3400
const STROKE_TTL_MS = 20000 // PRD 4.4：回放缓存最近 20s 笔画
const OPS_CAP = 600
const STATE_CAP = 100
const EXCLUDE_WINDOW = 40
const FALLBACK_WORD = '星空'
const FALLBACK_THEME = '星野'
const FALLBACK_NAME = '星河旅人'
/** 会话 level → 词库 level（镜像 draw.js LEVEL_MAP） */
const LEVEL_MAP: Record<string, string> = { gentle: 'easy', standard: 'mid', starry: 'hard' }

/* ---------- 运行时类型 ---------- */
type Stroke = Record<string, unknown>

type RoundOp =
  | { op: 'stroke'; stroke: Stroke; ts: number }
  | { op: 'clear'; ts: number }
  | { op: 'undo'; ts: number }

interface RoundRuntime {
  roundNo: number
  painterKey: string
  word: string
  wordTheme: string
  deadlineAt: number
  timer: ReturnType<typeof setTimeout> | null
  holdTimer: ReturnType<typeof setTimeout> | null
  /** 已猜中者顺序（决定名次分） */
  hitOrder: string[]
  /** 本回合分差明细（服务端视角 clientKey，广播时按观察者渲染 u_me） */
  deltas: { id: string; name: string; delta: number }[]
  /** 每人猜错的词集合（重复错词挡回，镜像 draw.js _myWrong） */
  wrongBy: Map<string, Set<string>>
  /** 画板操作序列（stroke push / clear 清空 / undo 弹出） */
  ops: RoundOp[]
  /** 回合已收口：后续 delta/guess/undo/clear 全部丢弃 */
  settled: boolean
}

interface SessionRuntime {
  sessionId: string
  level: string
  themeTags: string[]
  roundsTotal: number
  hostKey: string
  /** 作画轮换序列（种子乱序；服务端无「我」，不做首位置换） */
  order: string[]
  names: Map<string, string>
  scores: Map<string, number>
  usedWords: string[]
  playersTotal: number
  doneRounds: number
  finished: boolean
  round: RoundRuntime | null
}

export class DrawStrategy implements GameStrategy {
  private readonly states = new Map<string, SessionRuntime>()

  constructor(private readonly prisma: PrismaService) {}

  /* ---------- helpers ---------- */

  private vid(key: string, viewer: string): string {
    return key === viewer ? 'u_me' : key
  }

  private nameOf(state: SessionRuntime, key: string): string {
    return state.names.get(key) || FALLBACK_NAME
  }

  private scoreOf(state: SessionRuntime, key: string): number {
    return state.scores.get(key) || 0
  }

  private emit(
    sessionId: string,
    type: string,
    makeData: (viewerKey: string) => Record<string, unknown>
  ): void {
    const channelId = channelOf(sessionId)
    broadcastChannel(channelId, viewer => partyEnvelope(channelId, type, makeData(viewer)))
  }

  private clearRoundTimers(round: RoundRuntime): void {
    if (round.timer) {
      clearTimeout(round.timer)
      round.timer = null
    }
    if (round.holdTimer) {
      clearTimeout(round.holdTimer)
      round.holdTimer = null
    }
  }

  /* ---------- GameStrategy: 开局编排 ---------- */

  async initRound(session: PartySession, players: PartySessionPlayer[]): Promise<void> {
    // 防重：进行中的运行时直接忽略（重复 start 不重开局）；已终局允许重建
    const existing = this.states.get(session.id)
    if (existing && !existing.finished) return
    if (existing && existing.finished) this.states.delete(session.id)

    const joined = players.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const names = new Map<string, string>()
    const scores = new Map<string, number>()
    for (const p of joined) {
      names.set(p.clientKey, p.name)
      scores.set(p.clientKey, 0)
    }
    const host = joined.find(p => p.isHost)
    const state: SessionRuntime = {
      sessionId: session.id,
      level: session.level,
      themeTags: toStringArray(session.themeTags).filter(t => DRAW_THEMES.includes(t)),
      roundsTotal: Math.max(1, Math.min(20, session.rounds || 5)),
      hostKey: host ? host.clientKey : joined.length > 0 ? joined[0].clientKey : '',
      order: shuffleSeed(joined.map(p => p.clientKey), 'draw_order_' + session.id),
      names,
      scores,
      usedWords: [],
      playersTotal: players.length,
      doneRounds: 0,
      finished: false,
      round: null,
    }
    if (!state.order.length) return // 空席保护：无成员不编排
    this.states.set(session.id, state)
    // 容量保护：FIFO 驱逐最早会话
    while (this.states.size > STATE_CAP) {
      const oldest = this.states.keys().next().value
      if (oldest === undefined) break
      this.states.delete(oldest)
    }
    this.startRound(state, 1)
  }

  /* ---------- 回合状态机 ---------- */

  private startRound(state: SessionRuntime, roundNo: number): void {
    if (state.finished) return
    if (roundNo > state.roundsTotal) {
      this.finish(state)
      return
    }
    // 选词：优先按主题 + 难度；排除近 40 个已用词（词量枯竭时去掉排除再兜底一次）
    const themes = state.themeTags.length ? state.themeTags : undefined
    const level = LEVEL_MAP[state.level] || 'mid'
    let picked = pickDrawWord({
      themes,
      level,
      exclude: state.usedWords.slice(-EXCLUDE_WINDOW),
    }) as { word: string; theme: string }
    if (!picked || !picked.word) {
      picked = pickDrawWord({ themes, level }) as { word: string; theme: string }
    }
    const word = picked && picked.word ? picked.word : FALLBACK_WORD
    const wordTheme = picked && picked.theme ? picked.theme : FALLBACK_THEME
    state.usedWords.push(word)

    const painterKey = state.order[(roundNo - 1) % state.order.length] || ''
    if (!painterKey) {
      this.finish(state)
      return
    }
    const painterName = this.nameOf(state, painterKey)
    const round: RoundRuntime = {
      roundNo,
      painterKey,
      word,
      wordTheme,
      deadlineAt: Date.now() + CD_SECONDS * 1000,
      timer: null,
      holdTimer: null,
      hitOrder: [],
      deltas: [],
      wrongBy: new Map(),
      ops: [],
      settled: false,
    }
    state.round = round
    round.timer = setTimeout(() => {
      this.settle(state, 'timeout')
    }, CD_SECONDS * 1000 + TIMER_GRACE_MS)

    // 回合开场广播：词仅作画者视角可见（PRD 4.4）
    this.emit(state.sessionId, 'draw.new_round', viewer => ({
      round: roundNo,
      roundsTotal: state.roundsTotal,
      painterId: this.vid(painterKey, viewer),
      painterName,
      word: viewer === painterKey ? word : '',
      wordLen: word.length,
      wordTheme,
      cdSeconds: CD_SECONDS,
      guessersLeft: Math.max(0, state.playersTotal - 1),
      board: [] as unknown[],
    }))
  }

  /** 回合收口（reason: 'all' | 'timeout' | 'skip'，与 draw.js 一致） */
  private settle(state: SessionRuntime, reason: 'all' | 'timeout' | 'skip'): void {
    const round = state.round
    if (!round || round.settled || state.finished) return
    // 1) 封回合：清双计时器 + 置已结算（后续事件在入口挡回）
    round.settled = true
    this.clearRoundTimers(round)

    // 2) 计分：超时且无人猜中 → 作画者保底 +10（镜像 draw.js）
    if (reason === 'timeout' && round.hitOrder.length === 0) {
      state.scores.set(round.painterKey, this.scoreOf(state, round.painterKey) + TIMEOUT_PAINTER_BONUS)
      round.deltas.push({
        id: round.painterKey,
        name: this.nameOf(state, round.painterKey),
        delta: TIMEOUT_PAINTER_BONUS,
      })
    }
    state.doneRounds = round.roundNo
    const painterName = this.nameOf(state, round.painterKey)

    // 3) 回合明细写档 PartyRound（服务端视角 clientKey 落库；fire-and-forget 不阻编排）
    const dump = {
      word: round.word,
      theme: round.wordTheme,
      reason,
      painterId: round.painterKey,
      painterName,
      deltas: round.deltas,
    }
    const jsonData = JSON.parse(JSON.stringify(dump)) as Prisma.InputJsonValue
    this.prisma.client.partyRound
      .upsert({
        where: { sessionId_roundNo: { sessionId: state.sessionId, roundNo: round.roundNo } },
        create: { id: genId(), sessionId: state.sessionId, roundNo: round.roundNo, data: jsonData },
        update: { data: jsonData },
      })
      .catch(() => {
        /* 明细留存尽力而为（PRD 8.4），失败不阻回合推进 */
      })

    // 4) 广播回合结算：word 明牌、deltas 按观察者渲染 u_me
    this.emit(state.sessionId, 'draw.round_summary', viewer => ({
      round: round.roundNo,
      word: round.word,
      reason,
      deltas: round.deltas.map(d => ({
        id: this.vid(d.id, viewer),
        name: d.name,
        delta: d.delta,
      })),
      painter: painterName,
    }))

    // 5) summary 停顿 3.4s → 开下一轮或终局
    round.holdTimer = setTimeout(() => {
      round.holdTimer = null
      if (state.finished) return
      if (state.doneRounds >= state.roundsTotal) {
        this.finish(state)
        return
      }
      this.startRound(state, state.doneRounds + 1)
    }, SUMMARY_HOLD_MS)
  }

  /** 终局：贡献榜 + gameover 广播 + 会话转 SETTLING（结算聚合见 PRD 4.2，后段接入） */
  private finish(state: SessionRuntime): void {
    if (state.finished) return
    state.finished = true
    if (state.round) this.clearRoundTimers(state.round)

    const rows = state.order
      .map(key => ({ id: key, name: this.nameOf(state, key), score: this.scoreOf(state, key) }))
      .sort((a, b) => b.score - a.score)
    const mvpId = rows.length > 0 ? rows[0].id : ''
    const roundsPlayed = state.doneRounds
    this.emit(state.sessionId, 'gameover', viewer => ({
      contributions: rows.map(r => ({
        id: this.vid(r.id, viewer),
        name: r.name,
        score: r.score,
      })),
      mvpId: this.vid(mvpId, viewer),
      roundsPlayed,
    }))
    this.states.delete(state.sessionId)

    // 小程序收到 gameover 后本地也置 SETTLING；服务端持久化状态同步转档（失败静默）
    this.prisma.client.partySession
      .update({ where: { id: state.sessionId }, data: { status: 'SETTLING' } })
      .catch(() => {})
  }

  /* ---------- 服务端猜词判定 ---------- */

  private handleGuess(state: SessionRuntime, event: GameWsEvent): void {
    const round = state.round
    if (!round || round.settled) return
    const sender = event.viewerKey
    if (!sender || sender === round.painterKey) return
    if (round.hitOrder.indexOf(sender) >= 0) return
    const text = String(event.data.text || '').trim()
    if (!text || text.length > 32) return
    const senderName = this.nameOf(state, sender)

    // ---- 命中：名次分 + 作画者奖励 + 双行分差 ----
    if (text === round.word) {
      const rank = round.hitOrder.length + 1
      const gain = GUESS_POINTS[rank - 1] || 0
      state.scores.set(sender, this.scoreOf(state, sender) + gain)
      state.scores.set(round.painterKey, this.scoreOf(state, round.painterKey) + PAINTER_BONUS)
      round.hitOrder.push(sender)
      round.deltas.push({ id: sender, name: senderName, delta: gain })
      round.deltas.push({
        id: round.painterKey,
        name: this.nameOf(state, round.painterKey),
        delta: PAINTER_BONUS,
      })
      const guessersLeft = Math.max(0, state.playersTotal - 1 - round.hitOrder.length)
      this.emit(state.sessionId, 'draw.guess_result', viewer => ({
        round: round.roundNo,
        byId: this.vid(sender, viewer),
        byName: senderName,
        text: senderName + ' 猜中了！+',
        hit: true,
        guessersLeft,
      }))
      // 全场猜中（除作画者外全员命中）：封计时器 → 1.2s 后回合结算（镜像 draw.js）
      if (round.hitOrder.length >= state.playersTotal - 1) {
        if (round.timer) {
          clearTimeout(round.timer)
          round.timer = null
        }
        round.holdTimer = setTimeout(() => {
          round.holdTimer = null
          this.settle(state, 'all')
        }, ALL_HIT_DELAY_MS)
      }
      return
    }

    // ---- 未命中：重复错词挡回（镜像 _myWrong），其余广播流言 ----
    let wrong = round.wrongBy.get(sender)
    if (!wrong) {
      wrong = new Set<string>()
      round.wrongBy.set(sender, wrong)
    }
    if (wrong.has(text)) return
    wrong.add(text)
    this.emit(state.sessionId, 'draw.guess_result', viewer => ({
      round: round.roundNo,
      byId: this.vid(sender, viewer),
      byName: senderName,
      text: senderName + '：' + text,
      hit: false,
      guessersLeft: Math.max(0, state.playersTotal - 1 - round.hitOrder.length),
    }))
  }

  /* ---------- GameStrategy: WS 事件处理 ---------- */

  async handleWs(event: GameWsEvent): Promise<void> {
    const state = this.states.get(event.sessionId)
    if (!state || state.finished) return
    const round = state.round

    switch (event.type) {
      case 'draw.delta': {
        if (!round || round.settled) return
        if (event.viewerKey !== round.painterKey) return // 只有作画者能落笔（PRD 8.4）
        const raw = event.data.stroke
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
        round.ops.push({ op: 'stroke', stroke: { ...(raw as Stroke) }, ts: Date.now() })
        if (round.ops.length > OPS_CAP) round.ops.splice(0, round.ops.length - OPS_CAP)
        this.emit(state.sessionId, 'draw.delta', () => ({
          round: round.roundNo,
          stroke: raw,
        }))
        return
      }
      case 'draw.undo': {
        if (!round || round.settled) return
        if (event.viewerKey !== round.painterKey) return
        if (round.ops.length === 0) return
        round.ops.push({ op: 'undo', ts: Date.now() })
        this.emit(state.sessionId, 'draw.undo', () => ({ round: round.roundNo }))
        return
      }
      case 'draw.clear': {
        if (!round || round.settled) return
        if (event.viewerKey !== round.painterKey) return
        // 清盘 + 重倒计时（词不变，镜像 draw.js clear 行为）
        round.ops = [{ op: 'clear', ts: Date.now() }]
        round.deadlineAt = Date.now() + CD_SECONDS * 1000
        if (round.timer) clearTimeout(round.timer)
        round.timer = setTimeout(() => {
          this.settle(state, 'timeout')
        }, CD_SECONDS * 1000 + TIMER_GRACE_MS)
        this.emit(state.sessionId, 'draw.clear', () => ({
          round: round.roundNo,
          cdSeconds: CD_SECONDS,
        }))
        return
      }
      case 'draw.guess': {
        this.handleGuess(state, event)
        return
      }
      case 'draw.skip': {
        if (!round) return
        if (event.viewerKey !== state.hostKey) return // 房主才能跳过
        this.settle(state, 'skip')
        return
      }
      default:
        return
    }
  }

  /* ---------- GameStrategy: 消息合规校验（PRD 8.4：不合规抛错 → 编排层丢弃） ---------- */

  validate(event: GameWsEvent): void {
    switch (event.type) {
      case 'draw.delta': {
        const raw = event.data.stroke
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error('draw.delta 缺少 stroke 对象')
        }
        return
      }
      case 'draw.guess': {
        const text = String(event.data.text || '').trim()
        if (!text) throw new Error('draw.guess 缺少 text')
        return
      }
      case 'draw.undo':
      case 'draw.clear':
      case 'draw.skip':
        return
      default:
        throw new Error('非 draw 策略事件：' + event.type)
    }
  }

  /* ---------- GameStrategy: 强制结算钩子 ---------- */

  async settleRound(sessionId: string, reason: string): Promise<void> {
    const state = this.states.get(sessionId)
    if (!state) return
    const why: 'all' | 'timeout' | 'skip' =
      reason === 'all' || reason === 'timeout' ? reason : 'skip'
    this.settle(state, why)
  }

  /* ---------- GameStrategy: 新成员入频道回放（PRD 4.4 最近 20s stroke 队列） ---------- */

  onMemberJoined(sessionId: string, member: WsMember): void {
    const state = this.states.get(sessionId)
    if (!state || state.finished) return
    const round = state.round
    if (!round || round.settled) return
    const now = Date.now()
    const ops = round.ops.filter(op => now - op.ts <= STROKE_TTL_MS)
    let seconds = Math.ceil((round.deadlineAt - now) / 1000)
    if (seconds < 0) seconds = 0
    if (seconds > CD_SECONDS) seconds = CD_SECONDS
    const payload = {
      round: round.roundNo,
      painterId: this.vid(round.painterKey, member.clientKey),
      word: member.clientKey === round.painterKey ? round.word : '',
      wordTheme: round.wordTheme,
      cdSeconds: seconds,
      ops,
    }
    try {
      if (member.socket.readyState === member.socket.OPEN) {
        member.socket.send(partyEnvelope(channelOf(sessionId), 'draw.replay', payload))
      }
    } catch {
      /* 新成员回放失败静默 */
    }
  }

  /* ---------- GameStrategy: 会话清理 ---------- */

  cleanup(sessionId: string): void {
    const state = this.states.get(sessionId)
    if (!state) return
    if (state.round) this.clearRoundTimers(state.round)
    this.states.delete(sessionId)
  }
}
