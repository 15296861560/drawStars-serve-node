/**
 * WS 网关：/ws?channel=party.session.{sessionId}
 * - 连接即加入频道房间（broadcastChannel 广播面见 ws-hub）；断开即离开
 * - 身份：resolveClientKeyFromHeaders（accessToken 头优先，失败静默走 IP 观众键）
 * - 兼容原 echo 行为与初始欢迎消息
 */
import type { IncomingMessage } from 'http'
import WebSocket from 'ws'
import config from '../../config/publish-config'
import { resolveClientKeyFromHeaders } from '../../nest/modules/party/party.util'
import { joinChannel, leaveChannel } from './ws-hub'
import type { WsMember } from './ws-hub'
import { partyWsBridge } from './party-ws-bridge'
import type { PartyWsEnvelope } from './party-ws-bridge'

const port = config.ws_port

function channelOfRoom(req: IncomingMessage): string {
  try {
    const u = new URL(req.url || '', 'http://ws.local')
    const c = u.searchParams.get('channel')
    return c ? c.trim() : ''
  } catch {
    return ''
  }
}

/**
 * 解析 party WS 信封：JSON 且带字符串 type 字段才视为策略域信封，否则 null
 * （非信封保留原 echo 兼容行为）
 */
function parsePartyEnvelope(text: string): PartyWsEnvelope | null {
  try {
    const p = JSON.parse(text) as unknown
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const t = (p as { type?: unknown }).type
      if (typeof t === 'string' && t) return p as PartyWsEnvelope
    }
    return null
  } catch {
    return null
  }
}

const ws = new WebSocket.Server({ port }, () => {
  console.log(`websocket run port ${port}`)
})

ws.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(
      `[ws] port ${port} already in use — stop the previous node process or use: netstat -ano | findstr :${port}`
    )
    return
  }
  console.error('[ws] server error:', err)
})

ws.on('connection', (client: WebSocket, req: IncomingMessage) => {
  const channelId = channelOfRoom(req)
  const clientKey = resolveClientKeyFromHeaders(req.headers, req.socket.remoteAddress || '')
  const member: WsMember = { socket: client, channelId, clientKey }
  if (channelId) {
    joinChannel(member)
    // party 编排层：新成员入频道回放钩子（网关未绑定时为空操作）
    partyWsBridge()?.onMemberJoined(member)
  }

  client.send('连接WebSocket成功')
  client.on('message', msg => {
    const text = typeof msg === 'string' ? msg : msg.toString()
    const envelope = parsePartyEnvelope(text)
    if (envelope && channelId) {
      // party 策略域信封：路由到编排层（viewerKey 已按连接身份解析，客户端不可伪造）
      partyWsBridge()?.onMemberMessage(member, envelope)
      return
    }
    console.log('来自前端的数据：' + text)
    client.send('服务端发送的信息：' + new Date().toLocaleString())
  })

  client.on('close', () => {
    leaveChannel(member)
    console.log('前端主动断开了链接：')
  })
})
