/**
 * 大话骰 dice 策略：事件直通广播（范式同 tod.strategy.ts）
 * - 开局摇骰权威 = players 顺序第一位真人：摇完全场并广播 (dice.shake，
 *   携带 [seat, dices] 座次键值对)，观察端等待落定，超时自摇兜底
 * - 真人叫点 (dice.call) 与开牌 (dice.open) 由行动端广播（seq 为本轮动作序号），
 *   观察端按 gameNo / seq / 行动人归位；bot（u_bot_*）各端种子本地自演
 * - actorId 由服务端注入发送者 viewerKey；seat 键须为全局一致座次（勿用 id）
 * - 回放：shake / call / open 最近 6 条到达序事件，供断线重连者对齐
 */
import { clampInt } from '../party.util'
import { RelayStrategy } from './relay.strategy'

function isRangeInt(v: unknown, min: number, max: number): boolean {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max
}

/** 轻校验：gameNo / seq 序号 + shake 骰面 / call 点数（不合规抛错 → 丢弃） */
function diceCheck(type: string, data: Record<string, unknown>): void {
  if (!clampInt(data.gameNo, 1, 999999, 0)) throw new Error('dice.* 缺少合法局号 gameNo')
  const seqOk = clampInt(data.seq, 1, 999999, 0)
  if (!seqOk) throw new Error('dice.* 缺少合法动作序号 seq')
  if (type === 'dice.shake') {
    const rolls = data.rolls
    if (!Array.isArray(rolls) || !rolls.length || rolls.length > 8) {
      throw new Error('dice.shake rolls 非法')
    }
    for (const r of rolls) {
      if (!Array.isArray(r) || r.length !== 2) throw new Error('dice.shake rolls 项非法')
      if (!isRangeInt(r[0], 1, 99)) throw new Error('dice.shake seat 非法')
      const dices = r[1]
      if (!Array.isArray(dices) || !dices.length || dices.length > 8) {
        throw new Error('dice.shake dices 非法')
      }
      for (const d of dices) {
        if (!isRangeInt(d, 1, 6)) throw new Error('dice.shake 骰点越界')
      }
    }
    return
  }
  if (type === 'dice.call') {
    if (!isRangeInt(data.count, 1, 99)) throw new Error('dice.call count 越界')
    if (!isRangeInt(data.face, 1, 6)) throw new Error('dice.call face 越界')
  }
  // dice.open：仅序号，开牌按各家本地卡面判定
}

export class DiceStrategy extends RelayStrategy {
  constructor() {
    super({
      gameType: 'dice',
      events: ['dice.shake', 'dice.call', 'dice.open'],
      replayEvents: ['dice.shake', 'dice.call', 'dice.open'],
      check: diceCheck,
    })
  }
}
