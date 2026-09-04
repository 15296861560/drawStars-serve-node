import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common'
import WebSocket from 'ws'
import config from '../../../../config/publish-config'
import { ImAuthService } from '../auth/im-auth.service'
import { ImPushBus, PushMessage } from './im-push-bus'
import { ImPresenceService } from './im-presence.service'
import { ImMessageService } from '../message/im-message.service'
import { IM_DEFAULTS, WsEventType, PresenceStatus } from '../im.constants'
import type { ConnContext, WsEnvelope, WsIncoming } from '../im.types'

interface InternalConn extends ConnContext {
  ws: WebSocket
  heartbeatTimer?: ReturnType<typeof setInterval>
  alive: boolean
}

/**
 * ImWsGateway：自研 WebSocket 网关。
 * - 连接管理 / 心跳(25s ping,90s 超时) / 订阅表 / 多 Tab 互踢
 * - 上行路由：SUBSCRIBE/UNSUBSCRIBE/SEND/READ/PING/ROOM_PRESENCE
 * - 下行：订阅 ImPushBus 投递给在线已订阅连接
 */
@Injectable()
export class ImWsGateway implements OnModuleInit {
  private server!: WebSocket.Server
  private conns = new Map<string, InternalConn>() // connId -> conn

  constructor(
    private readonly authService: ImAuthService,
    private readonly pushBus: ImPushBus,
    private readonly presence: ImPresenceService,
    @Inject(forwardRef(() => ImMessageService))
    private readonly messageService: ImMessageService
  ) {}

  onModuleInit() {
    this.start()
    // 落库成功后的消息推送
    this.pushBus.on('push', (msg: PushMessage) => this.handlePush(msg))
    // 系统事件推送（好友申请/被踢等）
    this.pushBus.on('event', ({ targetUid, envelope }) => {
      this.sendToUser(targetUid, envelope)
    })
  }

  private start() {
    const port = config.im_ws_port
    this.server = new WebSocket.Server({ port }, () => {
      console.log(`[im-ws] gateway run port ${port}`)
    })

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[im-ws] port ${port} already in use`)
        return
      }
      console.error('[im-ws] server error:', err)
    })

    this.server.on('connection', (ws, req) => this.handleConnection(ws, req))
  }

  private parseTicketFromUrl(url: string): string | null {
    try {
      const q = url.split('?')[1] || ''
      for (const pair of q.split('&')) {
        const [k, v] = pair.split('=')
        if (k === 'ticket') return decodeURIComponent(v || '')
      }
    } catch {
      /* ignore */
    }
    return null
  }

  private async handleConnection(ws: WebSocket, req: { url?: string }) {
    const ticket = this.parseTicketFromUrl(req.url || '')
    let uid: string
    try {
      if (!ticket) throw new Error('missing ticket')
      uid = await this.authService.consumeWsTicket(ticket)
    } catch {
      ws.close(4001, 'invalid ticket')
      return
    }

    const connId = `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const conn: InternalConn = {
      uid,
      connId,
      tabId: connId,
      nodeId: 'local',
      subscribed: new Set<string>(),
      lastSeen: Date.now(),
      ws,
      alive: true
    }

    // 多 Tab 互踢：踢掉同 uid 旧连接
    this.kickOldConns(uid, connId)
    this.conns.set(connId, conn)
    this.presence.registerConn(uid, connId)
    await this.presence.setPresenceStatus(uid, PresenceStatus.ONLINE)

    // 心跳
    conn.heartbeatTimer = setInterval(
      () => this.heartbeat(conn),
      IM_DEFAULTS.wsHeartbeatSec * 1000
    )

    ws.on('message', raw => this.handleMessage(conn, raw))
    ws.on('close', () => this.handleClose(conn))
    ws.on('error', () => this.handleClose(conn))

    ws.send(
      JSON.stringify({
        event: WsEventType.PONG,
        ts: Date.now(),
        data: { connected: true }
      })
    )
  }

  private kickOldConns(uid: string, newConnId: string) {
    for (const [cid, c] of this.conns) {
      if (c.uid === uid && cid !== newConnId) {
        this.send(cid, {
          event: WsEventType.TAB_TAKEOVER,
          ts: Date.now(),
          data: { fromTabId: cid }
        })
        try {
          c.ws.close(4002, 'tab takeover')
        } catch {
          /* ignore */
        }
        this.cleanupConn(c)
      }
    }
  }

  private heartbeat(conn: InternalConn) {
    if (!conn.alive) {
      this.handleClose(conn)
      return
    }
    conn.alive = false
    try {
      conn.ws.ping()
    } catch {
      this.handleClose(conn)
    }
  }

  private async handleMessage(conn: InternalConn, raw: WebSocket.RawData) {
    let msg: WsIncoming
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    conn.lastSeen = Date.now()
    switch (msg.type) {
      case WsEventType.PING:
        this.send(conn.connId, {
          event: WsEventType.PONG,
          ts: Date.now(),
          data: {}
        })
        break
      case WsEventType.SUBSCRIBE:
        this.subscribe(conn, msg.conversationIds || [])
        break
      case WsEventType.UNSUBSCRIBE:
        this.unsubscribe(conn, msg.conversationIds || [])
        break
      case WsEventType.READ:
        if (msg.conversationId && msg.seq) {
          // 已读通过 REST 主路径处理；WS 仅转发同步（避免双写）
          this.send(conn.connId, {
            event: WsEventType.ACK,
            requestId: msg.requestId,
            ts: Date.now(),
            data: { ok: true }
          })
        }
        break
      case WsEventType.ROOM_PRESENCE:
        if (msg.roomId) {
          await this.handleRoomPresence(conn, msg.roomId)
        }
        break
      case WsEventType.SEND:
        await this.handleSend(conn, msg)
        break
      default:
        break
    }
  }

  private subscribe(conn: InternalConn, ids: string[]) {
    const limited = ids.slice(0, IM_DEFAULTS.subscribeBatchLimit)
    for (const id of limited) conn.subscribed.add(String(id))
  }

  private unsubscribe(conn: InternalConn, ids: string[]) {
    for (const id of ids) conn.subscribed.delete(String(id))
  }

  private async handleRoomPresence(conn: InternalConn, roomId: string) {
    conn.lastSeen = Date.now()
    conn.presenceTimer && clearTimeout(conn.presenceTimer)
    conn.inRoom = roomId
    await this.presence.joinRoom(conn.uid, roomId)
    // 缺 3 次（30s*3）视为离房
    conn.presenceTimer = setTimeout(
      async () => {
        if (conn.inRoom === roomId) {
          await this.presence.leaveRoom(conn.uid, roomId)
          conn.inRoom = undefined
        }
      },
      IM_DEFAULTS.roomPresenceSec *
        (IM_DEFAULTS.roomPresenceMissLimit + 1) *
        1000
    )
  }

  private async handleSend(conn: InternalConn, msg: WsIncoming) {
    if (!msg.payload) return
    try {
      const result = await this.messageService.send(conn.uid, msg.payload)
      this.send(conn.connId, {
        event: WsEventType.ACK,
        requestId: msg.requestId,
        ts: Date.now(),
        data: {
          ok: true,
          msgId: result.msgId,
          seq: result.seq,
          conversationId: result.conversationId
        }
      })
    } catch (e) {
      const code = (e as { imCode?: string })?.imCode || 'IM_NOT_CONNECTED'
      this.send(conn.connId, {
        event: WsEventType.ACK,
        requestId: msg.requestId,
        ts: Date.now(),
        data: { ok: false, errorCode: code }
      })
    }
  }

  private handlePush(msg: PushMessage) {
    // 仅向已订阅该会话且在线的连接投递
    for (const conn of this.conns.values()) {
      if (msg.targetUids && !msg.targetUids.includes(conn.uid)) continue
      if (!conn.subscribed.has(String(msg.conversationId))) continue
      this.send(conn.connId, {
        event: WsEventType.MESSAGE,
        ts: Date.now(),
        data: {
          ...msg.envelope,
          conversationId: msg.conversationId,
          convType: msg.convType
        }
      })
    }
  }

  /** 向某用户所有在线连接投递 */
  sendToUser(uid: string, envelope: WsEnvelope) {
    for (const conn of this.conns.values()) {
      if (conn.uid === uid) this.send(conn.connId, envelope)
    }
  }

  private send(connId: string, envelope: WsEnvelope) {
    const conn = this.conns.get(connId)
    if (!conn) return
    if (conn.ws.readyState !== WebSocket.OPEN) return
    try {
      conn.ws.send(JSON.stringify(envelope))
    } catch {
      /* ignore */
    }
  }

  private handleClose(conn: InternalConn) {
    if (!this.conns.has(conn.connId)) return
    this.cleanupConn(conn)
  }

  private cleanupConn(conn: InternalConn) {
    this.conns.delete(conn.connId)
    conn.heartbeatTimer && clearInterval(conn.heartbeatTimer)
    conn.presenceTimer && clearTimeout(conn.presenceTimer)
    this.presence.unregisterConn(conn.uid, conn.connId)
    if (conn.inRoom) {
      void this.presence.leaveRoom(conn.uid, conn.inRoom)
    }
    // 若该 uid 已无任何连接，标记离线
    if (!this.presence.isOnline(conn.uid)) {
      void this.presence.setPresenceStatus(conn.uid, PresenceStatus.OFFLINE)
    }
  }

  isUserOnline(uid: string) {
    return this.presence.isOnline(uid)
  }
}
