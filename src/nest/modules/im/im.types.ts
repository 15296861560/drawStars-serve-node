import type { ConvType, MsgType, TargetType } from './im.constants'

// ============ 发送消息（PRD §4.4.0）============
export interface SendTarget {
  convType: ConvType
  bizId: string // 对方 userId | groupId | roomId
}

export interface SendMessageDto {
  clientMsgId: string
  msgType: MsgType
  content: Record<string, unknown>
  conversationId?: string
  target?: SendTarget
}

export interface SendResult {
  conversationId: string
  msgId: string
  seq: number
  serverTime: number
  status: 'SUCCESS'
  duplicate?: boolean
}

// ============ WS 帧类型 ============
export interface WsEnvelope<T = Record<string, unknown>> {
  event: string
  requestId?: string
  ts: number
  data: T
}

export interface WsIncoming {
  type: string
  requestId?: string
  conversationIds?: string[]
  conversationId?: string
  seq?: number
  roomId?: string
  payload?: SendMessageDto
}

export interface ConnContext {
  uid: string
  connId: string
  tabId: string
  nodeId: string
  subscribed: Set<string>
  inRoom?: string
  lastSeen: number
  presenceTimer?: ReturnType<typeof setTimeout>
}
