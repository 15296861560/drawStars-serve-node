/**
 * 真心话大冒险 tod 策略：无服务端回合状态机的「事件直通」广播
 * 形状基线：对齐小程序 components/game/tod/tod.js 的种子同构设计——
 * - 抽人由各端 mock.pickSeed('tod_pick_<sid>_<no>') 种子同构算出，服务端不裁决
 * - 真人选「真心话 / 大冒险」(tod.pick)、题面出炉 (tod.question)、「完成 / 跳过」
 *   (tod.answer) 由行动端广播，观察端跟随渲染——question 把命中的题面即时同步给
 *   全员（流水 + 亮题看板），不再干等 answer 才推进；answer 必带 text
 *   （各端 api.todDraw 本地防连重缓存不同，观察端不重新抽题）
 * - actorId 由服务端注入发送者 viewerKey：各端 session.players 里自己的行
 *   渲染为 'u_me'，观察端按 players 列表解析，发送端回包解析不到自然丢弃
 * - 服务端轻校验（PRD 8.4）：kind 合法 / done 布尔 / text ≤ 200，不合规丢弃
 *
 * 回放口径：最近 6 条到达序事件（pick + question + answer），onMemberJoined 单发
 * 给断线重连者补位；更早缺口由下一轮事件自然收敛（tod 无需重放全集）。
 */
import { clampInt } from '../party.util'
import { RelayStrategy } from './relay.strategy'

const TOD_KINDS = new Set(['truth', 'dare'])
const TOD_TEXT_LIMIT = 200

/** 轻校验：no / kind / text / done（不合规抛错 → 编排层捕获并丢弃） */
function todCheck(type: string, data: Record<string, unknown>): void {
  if (!clampInt(data.no, 1, 999, 0)) throw new Error('tod.* 缺少合法轮次 no')
  const kind = String(data.kind || '')
  if (!TOD_KINDS.has(kind)) throw new Error('tod.* kind 非法：' + kind)
  if (type === 'tod.question') {
    if (String(data.text || '').length > TOD_TEXT_LIMIT) {
      throw new Error('tod.question text 超长')
    }
    if (Array.isArray(data.themes) && data.themes.length > 8) {
      throw new Error('tod.question themes 超量')
    }
  }
  if (type === 'tod.answer') {
    if (typeof data.done !== 'boolean') throw new Error('tod.answer 缺少布尔 done')
    if (String(data.text || '').length > TOD_TEXT_LIMIT) {
      throw new Error('tod.answer text 超长')
    }
  }
}

export class TodStrategy extends RelayStrategy {
  constructor() {
    super({
      gameType: 'tod',
      events: ['tod.pick', 'tod.question', 'tod.answer'],
      replayEvents: ['tod.pick', 'tod.question', 'tod.answer'],
      check: todCheck,
    })
  }
}
