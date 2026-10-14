import type { WsMember } from './ws-hub'

/**
 * party WS 网关静态插槽桥
 *
 * wsServer.ts 为模块顶层执行的独立 WS 壳（早于 Nest 容器启动），
 * 无法直接 import Nest 侧的 PartyGameService（会引发启动时序问题与循环依赖）。
 * 因此用「静态插槽」模式：Nest bootstrap 完成后调用 bindPartyWsGateway 绑定实例，
 * wsServer 在 message/join 回调内通过 partyWsBridge() 取用（可能为 null，需空值守卫）。
 */

/** 客户端发来的 WS 信封（type 必为字符串才视为信封，见 wsServer parseEnvelope） */
export interface PartyWsEnvelope {
  type: string
  data?: unknown
  ns?: unknown
  channelId?: unknown
  ts?: unknown
}

/** party 域 WS 网关（由 PartyGameService 实现） */
export interface PartyWsGateway {
  onMemberJoined(member: WsMember): void
  onMemberMessage(member: WsMember, envelope: PartyWsEnvelope): void
}

let gateway: PartyWsGateway | null = null

/** Nest bootstrap 后绑定网关实例 */
export function bindPartyWsGateway(g: PartyWsGateway): void {
  gateway = g
}

/** WS 壳运行期取用网关（未绑定时为 null） */
export function partyWsBridge(): PartyWsGateway | null {
  return gateway
}
