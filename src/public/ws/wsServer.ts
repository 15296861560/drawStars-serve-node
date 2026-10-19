/**
 * WS 网关：/ws?channel=party.session.{sessionId}
 * - 连接即加入频道房间（broadcastChannel 广播面见 ws-hub）；断开即离开
 * - 身份：resolveClientKeyFromHeaders（accessToken 头优先，失败静默走 IP 观众键）
 * - 挂载形态：
 *   1) 主端口 upgrade：attachPartyWsUpgrade(httpServer) 放行精确 /ws 路径
 *      （生产必经路径：Cloudflare 仅代理 443 白名单端口回源宿主 serve_port，独立 ws_port 公网不可达）
 *   2) 独立 ws_port：本地联调直连 ws://127.0.0.1:8021（生产侧即使端口被占也不影响主入口）
 */
import { createServer } from 'http'
import type { IncomingMessage, Server as HttpServer } from 'http'
import type { Duplex } from 'stream'
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

function pathnameOf(req: IncomingMessage): string {
  const url = req.url || ''
  const q = url.indexOf('?')
  return q === -1 ? url : url.slice(0, q)
}

/** 解析 party WS 信封：JSON 且带字符串 type 字段才视为策略域信封，否则 null（非信封保留原 echo 兼容行为） */
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

// noServer 模式：所有端口的 upgrade 统一走 ws.handleUpgrade，成员同处一个 hub 广播面
const ws = new WebSocket.Server({ noServer: true })

function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  ws.handleUpgrade(req, socket, head, client => handleConnection(client, req))
}

function handleConnection(client: WebSocket, req: IncomingMessage) {
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
}

/**
 * 主端口 upgrade 挂载：仅放行精确 /ws 路径，其余握手直接销毁
 * （生产形态：wss://serve.drawstars.cn/ws —— Cloudflare 443 代理回源宿主 serve_port）
 */
export function attachPartyWsUpgrade(server: HttpServer) {
  server.on('upgrade', (req, socket, head) => {
    if (pathnameOf(req) !== '/ws') {
      socket.destroy()
      return
    }
    handleUpgrade(req, socket, head)
  })
}

// 独立端口监听：本地联调直连 ws://127.0.0.1:8021；生产流量走主端口 attachPartyWsUpgrade
if (port) {
  const sidecar = createServer((_req, res) => {
    res.destroy()
  })
  sidecar.on('upgrade', handleUpgrade)
  sidecar.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[ws] port ${port} already in use — stop the previous node process or use: netstat -ano | findstr :${port}`
      )
      return
    }
    console.error('[ws] server error:', err)
  })
  sidecar.listen(port, () => {
    console.log(`websocket run port ${port}`)
  })
}
