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
import { channelSize, joinChannel, leaveChannel } from './ws-hub'
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

/*
 * 服务端存活扫描（与前端 me_ping 呼应）：
 * 生产链路 wss://serve.drawstars.cn 经 Cloudflare 代理，空闲 WS 约 100s 被其静默回收
 * —— 半开黑洞：客户端收不到 close、服务端写入不报错，但成员实际早已不在线。
 * 每 25s 扫一轮：先把存活标记翻为 false 并发协议层 ping（微信 socket 原生自动回 pong）；
 * 下一轮仍未被 pong / 任何上行（含 me_ping）标活的连接视为失活，立即 terminate
 * —— 触发 close → leaveChannel，presence 即刻写离线，广播面不再向黑洞投递。
 */
const HEARTBEAT_GAP_MS = 25_000
const aliveMap = new WeakMap<WebSocket, boolean>()
/** socket → member：sweeper 手里只有 socket 引用，靠它反查频道/身份打踢出日志 */
const memberMap = new WeakMap<WebSocket, WsMember>()
const sweeper = setInterval(() => {
  for (const client of Array.from(ws.clients)) {
    if (aliveMap.get(client) !== true) {
      const m = memberMap.get(client)
      console.warn(
        `[ws] sweep 踢出失活连接 ${m ? m.channelId : '?'} | client=${m ? m.clientKey : '?'}（25s 无 pong/上行，多为半开黑洞）`,
      )
      try {
        client.terminate()
      } catch {
        /* noop */
      }
      continue
    }
    aliveMap.set(client, false)
    try {
      client.ping()
    } catch {
      /* noop */
    }
  }
}, HEARTBEAT_GAP_MS)
sweeper.unref()

function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  ws.handleUpgrade(req, socket, head, client => handleConnection(client, req))
}

function handleConnection(client: WebSocket, req: IncomingMessage) {
  // 存活标记：pong 与任何上行消息都会翻回 true（见上方 sweeper 注释）
  aliveMap.set(client, true)
  client.on('pong', () => aliveMap.set(client, true))
  const channelId = channelOfRoom(req)
  const clientKey = resolveClientKeyFromHeaders(req.headers, req.socket.remoteAddress || '')
  const member: WsMember = { socket: client, channelId, clientKey }
  memberMap.set(client, member)
  if (channelId) {
    joinChannel(member)
    console.log(`[ws] join ${channelId} | client=${clientKey}（房间现 ${channelSize(channelId)} 连接）`)
    // party 编排层：新成员入频道回放钩子（网关未绑定时为空操作）。
    // 监听器内同步异常会击穿 Node 进程，桥调用一律外层兜底
    try {
      partyWsBridge()?.onMemberJoined(member)
    } catch (err) {
      console.error('[ws] onMemberJoined error:', err)
    }
  }

  client.send('连接WebSocket成功')
  client.on('message', msg => {
    aliveMap.set(client, true) // 任何上行（含客户端 me_ping 心跳）都视为存活
    const text = typeof msg === 'string' ? msg : msg.toString()
    const envelope = parsePartyEnvelope(text)
    if (envelope && channelId) {
      // 客户端 25s 保活心跳：网关层静默消费，不进策略域（活跃已由上一行标记）
      if (envelope.type === 'me_ping') return
      // party 策略域信封：路由到编排层（viewerKey 已按连接身份解析，客户端不可伪造）
      try {
        partyWsBridge()?.onMemberMessage(member, envelope)
      } catch (err) {
        console.error('[ws] onMemberMessage error:', err)
      }
      return
    }
    console.log('来自前端的数据：' + text)
    client.send('服务端发送的信息：' + new Date().toLocaleString())
  })

  // code 判读：1000=前端主动关闭（换页 onUnload、主动 close()）；1006=链路异常
  // （断网 / 半开黑洞 / sweep 踢出——踢出前一条必有 sweep 日志）；1005=对端未回状态码
  client.on('close', (code, reason) => {
    leaveChannel(member)
    const why =
      code === 1000 ? '（前端主动关闭，如换页）' : code === 1006 ? '（链路异常断开）' : ''
    const extra = reason && reason.length ? ' | reason=' + reason.toString().slice(0, 80) : ''
    console.log(`[ws] close ${channelId || '(无频道)'} | client=${clientKey} | code=${code}${why}${extra}`)
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
