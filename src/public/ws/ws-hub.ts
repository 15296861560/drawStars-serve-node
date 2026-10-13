/**
 * WS 频道房间：channel -> 成员集合
 * 通用能力，不含 party 业务语义（party 侧用 partyEnvelope 造 payload 后再 broadcast）
 */
import type WebSocket from 'ws'

export interface WsMember {
  socket: WebSocket
  channelId: string
  clientKey: string
}

const rooms = new Map<string, Set<WsMember>>()

export function joinChannel(member: WsMember): void {
  let room = rooms.get(member.channelId)
  if (!room) {
    room = new Set()
    rooms.set(member.channelId, room)
  }
  room.add(member)
}

export function leaveChannel(member: WsMember): void {
  const room = rooms.get(member.channelId)
  if (!room) return
  room.delete(member)
  if (!room.size) rooms.delete(member.channelId)
}

export function channelSize(channelId: string): number {
  const room = rooms.get(channelId)
  return room ? room.size : 0
}

/**
 * 频道广播：make 接收每个成员的 clientKey（供 party 侧做 u_me 渲染映射）
 */
export function broadcastChannel(channelId: string, make: (clientKey: string) => string): void {
  const room = rooms.get(channelId)
  if (!room || !room.size) return
  for (const member of Array.from(room)) {
    try {
      if (member.socket.readyState === member.socket.OPEN) {
        member.socket.send(make(member.clientKey))
      }
    } catch {
      /* 单连接发送失败不影响其他成员 */
    }
  }
}
