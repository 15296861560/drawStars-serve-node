import type { PartySession, PartySessionPlayer } from '@prisma/client'
import type { WsMember } from '../../../../public/ws/ws-hub'

/**
 * GameStrategy 策略接口（PRD 9.1 游戏策略注册表）
 *
 * 每个对局类型（draw/dice/lady/bluff/tod...）实现一份策略，
 * 由 PartyGameService 编排层在运行时注册进 GAME_STRATEGIES 注册表。
 * 运营后续新增玩法时：新增 games/{game_type}/strategy.ts 并在注册表挂载，
 * 无需改动回合编排与 WS 链路框架代码。
 *
 * 注意：REGISTRY 只在模块顶层定义 Map 与纯接口，
 * 策略实例推迟到 Nest DI 构造时注册（规避模块顶层求值时序问题，
 * 同 publish-config/wsServer 端口读取教训）。
 */

/** 策略域 WS 事件（由编排层解析好会话与发送者后投递给策略） */
export interface GameWsEvent {
  /** 会话 id */
  sessionId: string
  /** 发送者 viewerKey（clientKey） */
  viewerKey: string
  /** 事件类型，如 'draw.delta' / 'draw.guess' */
  type: string
  /** 事件负载数据 */
  data: Record<string, unknown>
}

/** 对局策略（实现方需保证幂等与防竞态） */
export interface GameStrategy {
  /** 开局/建立回合编排：初始化运行时状态并发送首个 new_round（按视角含各自可见数据） */
  initRound(session: PartySession, players: PartySessionPlayer[]): Promise<void>
  /** 处理一条策略域 WS 事件（编排层已校验会话状态为 PLAYING） */
  handleWs(event: GameWsEvent): Promise<void>
  /** 强制结算钩子（房主提前关闭等场景，触发当前回合立即收口） */
  settleRound(sessionId: string, reason: string): Promise<void>
  /** 校验消息合规性（不合规直接抛错 → 编排层捕获并丢弃，PRD 8.4：服务端规则校验） */
  validate(event: GameWsEvent): void
  /** 新成员加入频道回放钩子（PRD 4.4：服务端缓存最近 20s stroke 队列，新加入自动回放） */
  onMemberJoined?(sessionId: string, member: WsMember): void
  /** 会话清理钩子（清空该会话的内存运行时状态） */
  cleanup?(sessionId: string): void
}

/** 游戏策略注册表：gameType → strategy 实例 */
export const GAME_STRATEGIES: Map<string, GameStrategy> = new Map()

/** 运行时注册策略（Nest DI 构造编排服务时调用） */
export function registerGameStrategy(gameType: string, strategy: GameStrategy): void {
  GAME_STRATEGIES.set(gameType, strategy)
}
