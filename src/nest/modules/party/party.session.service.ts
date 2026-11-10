/**
 * 趣局会话：18 端点契约的会话部分（服务端全责对齐小程序现有形状）
 * - 所有返回恒 200 裸回包；规则性拒绝一律形内语义（{} / 渲染不动）
 * - 渲染注入 mode:'online'；viewerKey 行 id 渲染为 'u_me'
 */
import { Injectable } from '@nestjs/common'
import type { Prisma, PartySession, PartySessionPlayer } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PartyProfileService } from './party.profile.service'
import { PartyAdminService } from './party.admin.service'
import { PartyGameService } from './games/party.game.service'
import { GAME_MAP, PENALTY_DEFAULT, TOD_THEMES, randomCode } from './data/constants'
import { broadcastChannel } from '../../../public/ws/ws-hub'
import {
  CARD_BACKGROUND,
  DEFAULT_ROUNDS,
  LEVEL_KEYS,
  MVP_BADGES,
  buildHistoryRow,
  channelOf,
  clampInt,
  dailyWishText,
  dayKey,
  fmtDate,
  genId,
  parseBodyList,
  partyEnvelope,
  toStringArray,
} from './party.util'

const GAME_KEYS = Object.keys(GAME_MAP as Record<string, unknown>)

/** 结算入账双封顶（PRD 4.2 L229，与小程序 settle.js 同口径）：单场 ≤60、单玩家每日 ≤100 */
const SETTLE_CAP_PER_GAME = 60
const SETTLE_CAP_PER_DAY = 100

@Injectable()
export class PartySessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: PartyProfileService,
    private readonly gameService: PartyGameService,
    private readonly adminService: PartyAdminService
  ) {}

  /* ---------- 渲染 ---------- */
  private sortPlayers(players: PartySessionPlayer[]): PartySessionPlayer[] {
    return players.slice().sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
  }

  private extraObject(v: unknown): Record<string, unknown> {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>
    }
    return {}
  }

  private renderPlayer(p: PartySessionPlayer, viewerKey: string) {
    return {
      id: p.clientKey === viewerKey ? 'u_me' : p.clientKey,
      name: p.name,
      avatarUrl: p.avatarUrl || '',
      ready: !!p.ready,
      isHost: !!p.isHost,
      online: !!p.online,
      absent: !!p.absent,
      extra: this.extraObject(p.extra),
    }
  }

  private renderSession(session: PartySession, players: PartySessionPlayer[], viewerKey: string) {
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    const meta = gameMap[session.gameType]
    const sorted = this.sortPlayers(players)
    return {
      id: session.id,
      code: session.code,
      gameType: session.gameType,
      gameName: meta && meta.name ? meta.name : session.gameType,
      gameEmoji: meta && meta.emoji ? meta.emoji : '',
      status: session.status,
      level: session.level,
      themeTags: toStringArray(session.themeTags),
      rounds: session.rounds,
      currentRound: session.currentRound,
      playerLimit: session.playerLimit,
      penalty: { mode: 'text', text: session.penaltyText },
      penaltyMode: session.penaltyMode,
      joker: !!session.joker,
      // 房间点位：小程序入房侧校验距离用；开局未上报定位则为 null
      location:
        session.latitude != null && session.longitude != null
          ? { latitude: session.latitude, longitude: session.longitude }
          : null,
      mode: 'online',
      players: sorted.map(p => this.renderPlayer(p, viewerKey)),
    }
  }

  private async playersOf(sessionId: string): Promise<PartySessionPlayer[]> {
    return this.prisma.client.partySessionPlayer.findMany({ where: { sessionId } })
  }

  private async findSession(id: string): Promise<PartySession | null> {
    if (!id) return null
    return this.prisma.client.partySession.findUnique({ where: { id } })
  }

  private async renderedAfterChange(id: string, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return {}
    return this.renderSession(session, await this.playersOf(id), viewerKey)
  }

  /* ---------- 房间点位 ---------- */
  /** 经纬合法性一票判：非数值 / 越界一律视为没有点位 */
  private toLocation(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    return { latitude: lat, longitude: lng }
  }

  /** 兼容嵌套 location 与平铺两种入参形态（小程序开局发 payload.location） */
  private parseLocationBody(src: Record<string, any>): { latitude: number; longitude: number } | null {
    if (src && src.location && typeof src.location === 'object') {
      const nested = this.toLocation(src.location.latitude, src.location.longitude)
      if (nested) return nested
    }
    return this.toLocation(src && src.latitude, src && src.longitude)
  }

  /** 球面距离（米）：附近查找的半径判准 */
  private distanceMeters(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ): number {
    const rad = Math.PI / 180
    const dLat = (to.latitude - from.latitude) * rad
    const dLng = (to.longitude - from.longitude) * rad
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(from.latitude * rad) * Math.cos(to.latitude * rad) * Math.sin(dLng / 2) ** 2
    return 6371000 * 2 * Math.asin(Math.sqrt(h))
  }

  /* ---------- WS 广播 ---------- */
  private emit(
    sessionId: string,
    type: string,
    makeData: (viewerKey: string) => Record<string, unknown>
  ): void {
    const channelId = channelOf(sessionId)
    broadcastChannel(channelId, viewerKey =>
      partyEnvelope(channelId, type, makeData(viewerKey))
    )
  }

  private async broadcastPlayers(sessionId: string): Promise<void> {
    const players = this.sortPlayers(await this.playersOf(sessionId))
    this.emit(sessionId, 'players', viewerKey => ({
      players: players.map(p => this.renderPlayer(p, viewerKey)),
    }))
  }

  /* ---------- 1. 创建（payload 无 name，房主档案默认名兜底） ---------- */
  async create(body: Record<string, any>, viewerKey: string) {
    const src = body || {}
    const gameType = GAME_KEYS.indexOf(src.gameType) >= 0 ? src.gameType : 'tod'
    // Admin 域游戏开关（PRD 8.6 软灰度）：offline → 无 id 回包，小程序同网络失败自然路径不进房
    const offlineInfo = await this.adminService.checkGameOnline(gameType)
    if (offlineInfo) {
      return {
        offline: true,
        gameType,
        gameName: offlineInfo.gameName,
        hint: offlineInfo.hint,
      }
    }
    const level = LEVEL_KEYS.indexOf(src.level) >= 0 ? src.level : 'standard'
    const defRounds = DEFAULT_ROUNDS[gameType] != null ? DEFAULT_ROUNDS[gameType] : 5
    const rounds =
      src.rounds != null ? clampInt(src.rounds, 0, 99, defRounds) : defRounds
    const playerLimit = clampInt(src.playerLimit, 2, 8, 4)
    const penaltyRaw =
      (src.penalty && src.penalty.text) || src.penaltyText || PENALTY_DEFAULT
    const penaltyText = String(penaltyRaw).slice(0, 255)
    const penaltyMode = gameType === 'dice' && src.penaltyMode === 'points' ? 'points' : 'drink'
    const joker = gameType === 'lady' ? !!src.joker : false
    const themeTags =
      gameType === 'tod'
        ? parseBodyList(src.themeTags).filter(t => TOD_THEMES.indexOf(t) >= 0)
        : []
    // 开局点位：小程序静默上报 location（拒绝授权则不带，房间不参与附近查找也无妨）
    const location = this.parseLocationBody(src)

    let code = randomCode(6)
    for (let i = 0; i < 8; i++) {
      const dup = await this.prisma.client.partySession.findUnique({ where: { code } })
      if (!dup) break
      code = randomCode(6)
    }

    const session = await this.prisma.client.partySession.create({
      data: {
        id: genId(),
        code,
        gameType,
        level,
        themeTags,
        rounds,
        currentRound: 0,
        playerLimit,
        penaltyMode,
        penaltyText,
        joker,
        status: 'WAITING',
        ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
      },
    })

    const profile = await this.profileService.ensureProfile(viewerKey)
    await this.prisma.client.partySessionPlayer.create({
      data: {
        id: genId(),
        sessionId: session.id,
        clientKey: viewerKey,
        name: profile.name,
        avatarUrl: profile.avatarUrl || '',
        ready: true,
        isHost: true,
        online: true,
        absent: false,
        joinedRound: 1,
      },
    })

    return this.renderSession(session, await this.playersOf(session.id), viewerKey)
  }

  /* ---------- 2. 口令入房 / 6. 详情 ---------- */
  async byCode(param: string, viewerKey: string) {
    const code = String(param || '').trim().toUpperCase()
    if (!code) return {}
    const session = await this.prisma.client.partySession.findUnique({ where: { code } })
    if (!session) return {}
    return this.renderSession(session, await this.playersOf(session.id), viewerKey)
  }

  async detail(id: string, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return {}
    return this.renderSession(session, await this.playersOf(id), viewerKey)
  }

  /* ---------- 3. 加入 ---------- */
  async join(id: string, body: Record<string, any>, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return {}

    const name = String((body && body.name) || '').trim().slice(0, 32)
    const uniqueWhere = { sessionId_clientKey: { sessionId: id, clientKey: viewerKey } }
    const existing = await this.prisma.client.partySessionPlayer.findUnique({ where: uniqueWhere })

    if (existing) {
      await this.profileService.ensureProfile(viewerKey, name)
      const data: { online: boolean; name?: string } = { online: true }
      if (name && name !== existing.name) data.name = name
      await this.prisma.client.partySessionPlayer.update({ where: uniqueWhere, data })
      return this.renderedAfterChange(id, viewerKey)
    }

    if (session.status === 'CLOSED') return {}
    const players = await this.playersOf(id)
    if (players.length >= session.playerLimit) return {}

    const profile = await this.profileService.ensureProfile(viewerKey, name)
    await this.prisma.client.partySessionPlayer.create({
      data: {
        id: genId(),
        sessionId: session.id,
        clientKey: viewerKey,
        name: profile.name,
        avatarUrl: profile.avatarUrl || '',
        ready: false,
        isHost: false,
        online: true,
        absent: false,
        joinedRound: Math.max(1, session.currentRound || 1),
      },
    })
    await this.broadcastPlayers(id)
    return this.renderedAfterChange(id, viewerKey)
  }

  /* ---------- 4. 准备 ---------- */
  async setReady(id: string, body: Record<string, any>, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return {}
    await this.prisma.client.partySessionPlayer.updateMany({
      where: { sessionId: id, clientKey: viewerKey },
      data: { ready: !!(body && body.ready), online: true },
    })
    await this.broadcastPlayers(id)
    return this.renderedAfterChange(id, viewerKey)
  }

  /* ---------- 5. 房主操作（start / kick / absent / absent_revoke / close） ---------- */
  async hostAction(id: string, body: Record<string, any>, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return {}

    const uniqueWhere = { sessionId_clientKey: { sessionId: id, clientKey: viewerKey } }
    const requester = await this.prisma.client.partySessionPlayer.findUnique({ where: uniqueWhere })
    if (!requester || !requester.isHost) {
      // 非房主：形内拒绝（原样渲染，不粘性降级客户端在线态）
      return this.renderedAfterChange(id, viewerKey)
    }

    const action = String((body && body.action) || '')
    const rawTarget = (body && body.targetId) || ''
    const targetKey = rawTarget === 'u_me' || rawTarget === '' ? viewerKey : String(rawTarget)

    switch (action) {
      case 'start': {
        const currentRound = session.currentRound || 1
        const updated = await this.prisma.client.partySession.update({
          where: { id },
          data: { status: 'PLAYING', startedAt: new Date(), currentRound },
        })
        this.emit(id, 'session.start', () => ({
          sessionId: id,
          code: updated.code,
          gameType: updated.gameType,
          rounds: updated.rounds,
        }))
        await this.broadcastPlayers(id)
        // 级联开局编排：策略运行时初始化 + 首个 new_round 广播（GameStrategy 框架挂接点）
        await this.gameService.onSessionStart(updated, await this.playersOf(id))
        return this.renderSession(updated, await this.playersOf(id), viewerKey)
      }
      case 'kick': {
        const done = await this.prisma.client.partySessionPlayer.deleteMany({
          where: { sessionId: id, clientKey: targetKey },
        })
        if (done.count > 0) {
          this.emit(id, 'session.kick', viewerKey0 => ({
            targetId: viewerKey0 === targetKey ? 'u_me' : targetKey,
          }))
          await this.broadcastPlayers(id)
        }
        break
      }
      case 'absent': {
        await this.prisma.client.partySessionPlayer.updateMany({
          where: { sessionId: id, clientKey: targetKey },
          data: { absent: true },
        })
        await this.broadcastPlayers(id)
        break
      }
      case 'absent_revoke': {
        await this.prisma.client.partySessionPlayer.updateMany({
          where: { sessionId: id, clientKey: targetKey },
          data: { absent: false },
        })
        await this.broadcastPlayers(id)
        break
      }
      case 'close': {
        const players = await this.playersOf(id)
        const updated = await this.prisma.client.partySession.update({
          where: { id },
          data: { status: 'CLOSED', closedAt: new Date() },
        })
        await this.upsertCard(updated, players)
        this.emit(id, 'session.close', () => ({}))
        // 级联清场：策略运行时与 WS 缓存回收
        this.gameService.onSessionClose(id)
        return this.renderSession(updated, players, viewerKey)
      }
      default:
        break
    }
    return this.renderedAfterChange(id, viewerKey)
  }

  /* ---------- 7. 我的历史趣局 ---------- */
  async mine(viewerKey: string) {
    const rows = await this.prisma.client.partySessionPlayer.findMany({
      where: { clientKey: viewerKey },
      include: { session: { include: { players: true } } },
      orderBy: { session: { createdAt: 'desc' } },
      take: 8,
    })
    return {
      list: rows
        .filter(r => r.session)
        .map(r => buildHistoryRow(r.session, r.session.players)),
    }
  }

  /* ---------- 9. 附近房间（加入页查身边 50 米免口令入座）---------- */
  async nearby(query: Record<string, any>, viewerKey: string) {
    const me = this.toLocation(query && query.latitude, query && query.longitude)
    // 缺/坏定位：形内拒绝（恒 200 裸回包），小程序按「查不到」渲染，不误判离线
    if (!me) return { list: [] }
    const radius = clampInt(query && query.radius, 10, 1000, 50)

    // 趣局是短生命场次：只扫近 24h 带点位的未落幕局，避免历史局全表扫
    const candidates = await this.prisma.client.partySession.findMany({
      where: {
        status: { in: ['WAITING', 'PLAYING'] },
        latitude: { not: null },
        createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      },
      take: 200,
      orderBy: { createdAt: 'desc' },
    })

    const withDistance = candidates
      .map(session => ({
        session,
        distanceM: Math.max(
          1,
          Math.round(
            this.distanceMeters(me, {
              latitude: session.latitude as number,
              longitude: session.longitude as number,
            })
          )
        ),
      }))
      .filter(x => x.distanceM <= radius)
      .sort((a, b) => a.distanceM - b.distanceM)
    if (!withDistance.length) return { list: [] }

    // 批取席位：满员局免口令也进不去，直接从列表剔除
    const players = await this.prisma.client.partySessionPlayer.findMany({
      where: { sessionId: { in: withDistance.map(x => x.session.id) } },
    })
    const bySession = new Map<string, PartySessionPlayer[]>()
    for (const p of players) {
      const seats = bySession.get(p.sessionId) || []
      seats.push(p)
      bySession.set(p.sessionId, seats)
    }

    const list = withDistance
      .filter(x => (bySession.get(x.session.id) || []).length < x.session.playerLimit)
      .slice(0, 20)
      .map(x => ({
        ...this.renderSession(x.session, bySession.get(x.session.id) || [], viewerKey),
        distanceM: x.distanceM,
      }))
    return { list }
  }

  /* ---------- 8. 纪念卡（三级兜底，绝不 4xx） ---------- */
  private buildCard(session: PartySession, players: PartySessionPlayer[]) {
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    const meta = gameMap[session.gameType]
    const sorted = this.sortPlayers(players)
    const mvp = sorted.find(p => p.isHost) || sorted[0]
    const badge = MVP_BADGES[session.gameType] || '本场 MVP'
    return {
      id: 'card_' + session.id,
      title: '拾星纪念卡',
      sessionMeta: {
        sessionId: session.id,
        gameType: session.gameType,
        gameName: meta && meta.name ? meta.name : session.gameType,
        code: session.code,
        playedAt: fmtDate(session.closedAt || session.startedAt || session.createdAt),
        rounds: session.currentRound || 0,
        playerCount: sorted.length,
      },
      players: sorted.map(p => ({
        id: p.clientKey,
        name: p.name,
        avatar: p.avatarUrl || '',
        score: 0,
        mvp: p === mvp,
        badge: p === mvp ? badge : '',
      })),
      starWish: dailyWishText(),
      background: CARD_BACKGROUND,
      shareCardUrl: '',
      shareId: 'share_' + session.id,
    }
  }

  private emptyCard(id: string) {
    return {
      id: 'card_' + id,
      title: '拾星纪念卡',
      sessionMeta: {
        sessionId: id,
        gameType: '',
        code: '',
        playedAt: '',
        rounds: 0,
        playerCount: 0,
      },
      players: [],
      starWish: dailyWishText(),
      background: CARD_BACKGROUND,
      shareCardUrl: '',
      shareId: 'share_' + id,
    }
  }

  private async upsertCard(session: PartySession, players: PartySessionPlayer[]): Promise<void> {
    const data = this.buildCard(session, players)
    const jsonData = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
    // id 列 VarChar(32)：session.id 恰好 32 位可容纳；'card_' 前缀（38 位）曾超宽触发 P2000
    const cardId = session.id
    await this.prisma.client.partyCard.upsert({
      where: { id: cardId },
      create: { id: cardId, sessionId: session.id, data: jsonData },
      update: { data: jsonData },
    })
  }

  async card(id: string, viewerKey: string) {
    const cardId = id
    const stored = await this.prisma.client.partyCard.findUnique({ where: { id: cardId } })
    if (stored && stored.data) return stored.data

    const session = await this.findSession(id)
    if (session) {
      const players = await this.playersOf(id)
      if (players.length) return this.buildCard(session, players)
    }
    return this.emptyCard(id)
  }

  /* ---------- 12. 结算星光入账（PRD 4.2 结算聚合后段接入）----------
   * 贡献分 / MVP 由客户端在局内实时记分（服务端无逐轮账），提交的是按 4.2 换算
   * （1 贡献分 = 5 星光、MVP +10 并列均分）后的单场星光；服务端只做安全边界：
   * 非本局玩家拒绝、未开局拒绝、单场 60 / 每日 100 双封顶、settle 流水按
   * (clientKey, sessionId) 幂等防重复入账 —— 结算页重进 / 重复提交都只入一次
   */
  async settleGrant(id: string, body: Record<string, unknown>, viewerKey: string) {
    const session = await this.findSession(id)
    if (!session) return { ok: false, msg: '场次不存在' }
    if (!session.startedAt) return { ok: false, msg: '对局尚未开始，无法结算入账' }
    const seat = await this.prisma.client.partySessionPlayer.findUnique({
      where: { sessionId_clientKey: { sessionId: id, clientKey: viewerKey } },
    })
    if (!seat) return { ok: false, msg: '不在本局玩家名单内' }

    const day = dayKey()
    // 结算入账是写路径：按需建档（与读路径不建档口径互补）
    await this.profileService.ensureProfile(viewerKey)
    const res = await this.prisma.client.$transaction(async (tx) => {
      // 幂等：同局同人已有 settle 流水（remark = sessionId）→ 回显余额，不再入账
      const dup = await tx.partyStarTrans.findFirst({
        where: { clientKey: viewerKey, source: 'settle', remark: id },
      })
      const readBalance = async () => {
        const profile = await tx.partyProfile.findUnique({ where: { clientKey: viewerKey } })
        return profile ? profile.starVal : 0
      }
      if (dup) return { duplicate: true, starGain: 0, starVal: await readBalance() }

      // 每日封顶：当日 settle 流水合计 + 本次 ≤ 100，超出部分不再入账
      const today = await tx.partyStarTrans.findMany({
        where: { clientKey: viewerKey, source: 'settle', day },
        select: { amount: true },
      })
      const used = today.reduce((sum, r) => sum + r.amount, 0)
      const asked = clampInt(body && body.starGain, 0, SETTLE_CAP_PER_GAME, 0)
      const eff = Math.max(0, Math.min(asked, SETTLE_CAP_PER_DAY - used))
      if (eff <= 0) return { duplicate: false, starGain: 0, starVal: await readBalance(), dailyCapped: true }

      const updated = await tx.partyProfile.update({
        where: { clientKey: viewerKey },
        data: { starVal: { increment: eff } },
      })
      await tx.partyStarTrans.create({
        data: {
          id: genId(),
          clientKey: viewerKey,
          amount: eff,
          balanceAfter: updated.starVal,
          source: 'settle', // 对局结算（PRD 4.2）——与任务领取 source='task' 并列的入账通道
          day,
          remark: id, // sessionId：幂等锚点，同局同人只入一次
        },
      })
      return { duplicate: false, starGain: eff, starVal: updated.starVal, dailyCapped: eff < asked }
    })
    return { ok: true, ...res }
  }
}
