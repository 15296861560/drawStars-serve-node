/**
 * 瞎掰王 bluff 策略：事件直通广播（范式同 tod.strategy.ts）
 * - 命题权威 = players 顺序第一位真人：拉到命题后广播 (bluff.prompt 全量字段)，
 *   观察端等待降临，超时自拉兜底；命题/答案/投票无服务端状态机
 * - 真人答案 (bluff.answer) 与审判票 (bluff.vote，卡位 k 为各端种子同构洗牌键)
 *   由行动端广播，观察端跟随；bot（u_bot_*）各端种子本地自演
 * - actorId 由服务端注入发送者 viewerKey：观察端据此归账答案/选票，
 *   发送端回包解析不到槽位自然丢弃
 * - 回放：prompt / answer / vote 最近 6 条到达序事件，供断线重连者对齐
 */
import { clampInt } from '../party.util'
import { RelayStrategy } from './relay.strategy'

const BLUFF_TEXT_LIMIT = 200
const BLUFF_BOT_ITEM_LIMIT = 120

/** 轻校验：round 轮次 + 各事件字段（不合规抛错 → 丢弃） */
function bluffCheck(type: string, data: Record<string, unknown>): void {
  if (!clampInt(data.round, 1, 999, 0)) throw new Error('bluff.* 缺少合法轮次 round')
  if (type === 'bluff.prompt') {
    for (const k of ['prompt', 'truth']) {
      if (String(data[k] || '').length > BLUFF_TEXT_LIMIT) throw new Error('bluff.prompt ' + k + ' 超长')
    }
    if (String(data.emoji || '').length > 8) throw new Error('bluff.prompt emoji 超长')
    if (String(data.bluffDefault || '').length > BLUFF_BOT_ITEM_LIMIT) {
      throw new Error('bluff.prompt bluffDefault 超长')
    }
    const bots = data.botAnswers
    if (bots !== undefined) {
      if (!Array.isArray(bots) || bots.length > 8) throw new Error('bluff.prompt botAnswers 非法')
      for (const b of bots) {
        if (String(b ?? '').length > BLUFF_BOT_ITEM_LIMIT) throw new Error('bluff.prompt botAnswers 超长')
      }
    }
    return
  }
  if (type === 'bluff.answer') {
    if (data.auto !== undefined && typeof data.auto !== 'boolean') {
      throw new Error('bluff.answer auto 非布尔')
    }
    const text = String(data.text || '')
    if (!text.length || text.length > BLUFF_TEXT_LIMIT) throw new Error('bluff.answer text 非法')
    return
  }
  // bluff.vote：单票卡位键（c0…）
  if (typeof data.k !== 'string' || !data.k.length || data.k.length > 8) {
    throw new Error('bluff.vote 缺少合法卡位 k')
  }
}

export class BluffStrategy extends RelayStrategy {
  constructor() {
    super({
      gameType: 'bluff',
      events: ['bluff.prompt', 'bluff.answer', 'bluff.vote'],
      replayEvents: ['bluff.prompt', 'bluff.answer', 'bluff.vote'],
      check: bluffCheck,
    })
  }
}
