/**
 * 小姐牌 lady 策略：事件直通广播（范式同 tod.strategy.ts）
 * - 牌堆由各端 buildLadyDeck(…, sid) 种子同构洗出，服务端不裁决
 * - 真人轮抽牌 (lady.draw，携带牌面内容) 与开牌判定 (lady.resolve) 由行动端
 *   广播，观察端跟随渲染；bot（u_bot_*）各端种子本地自演，不经服务端
 * - actorId 由服务端注入发送者 viewerKey：观察端解析为抽牌人，发送端回包
 *   因自己那行渲染为 'u_me' 解析不到而自然丢弃
 * - 回放口径：仅缓存 lady.draw（last 6 条）——重连者凭最近几张牌面对齐进度
 */
import { clampInt } from '../party.util'
import { RelayStrategy } from './relay.strategy'

/** 轻校验：seq 递增序号 + draw 牌面短字段（不合规抛错 → 丢弃） */
function ladyCheck(type: string, data: Record<string, unknown>): void {
  if (!clampInt(data.seq, 1, 999, 0)) throw new Error('lady.* 缺少合法序号 seq')
  if (type !== 'lady.draw') return
  for (const k of ['value', 'suit', 'emoji', 'label']) {
    if (String(data[k] ?? '').length > 8) throw new Error('lady.draw ' + k + ' 超长')
  }
  if (String(data.text || '').length > 40) throw new Error('lady.draw text 超长')
  if (String(data.tip || '').length > 120) throw new Error('lady.draw tip 超长')
  if (typeof data.custom !== 'boolean' || typeof data.isJoker !== 'boolean') {
    throw new Error('lady.draw 缺少布尔 custom / isJoker')
  }
}

export class LadyStrategy extends RelayStrategy {
  constructor() {
    super({
      gameType: 'lady',
      events: ['lady.draw', 'lady.resolve'],
      replayEvents: ['lady.draw'],
      check: ladyCheck,
    })
  }
}
