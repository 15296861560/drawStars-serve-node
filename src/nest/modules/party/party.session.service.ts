/**
 * 星会会话：18 端点契约的会话部分（服务端全责对齐小程序现有形状）
 * - 所有返回恒 200 裸回包；规则性拒绝一律形内语义（{} / 渲染不动）
 * - 渲染注入 mode:'online'；viewerKey 行 id 渲染为 'u_me'
 */
import { Injectable } from '@nestjs/common'
import type { Prisma, PartySession, PartySessionPlayer } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PartyProfileService } from './party.profile.service'
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
  fmtDate,
  genId,
  parseBodyList,
  partyEnvelope,
  toStringArray,
} from './party.util'

const GAME_KEYS = Object.keys(GAME_MAP as Record<string, unknown>)

@Injectable()
export class PartySessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: PartyProfileService
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
        return this.renderSession(updated, players, viewerKey)
      }
      default:
        break
    }
    return this.renderedAfterChange(id, viewerKey)
  }

  /* ---------- 7. 我的历史星会 ---------- */
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

  /* ---------- 8. 纪念卡（三级兜底，绝不 4xx） ---------- */
  private buildCard(session: PartySession, players: PartySessionPlayer[]) {
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    const meta = gameMap[session.gameType]
    const sorted = this.sortPlayers(players)
    const mvp = sorted.find(p => p.isHost) || sorted[0]
    const badge = MVP_BADGES[session.gameType] || '本场 MVP'
    return {
      id: 'card_' + session.id,
      title: '赴星纪念卡',
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
      title: '赴星纪念卡',
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
    const cardId = 'card_' + session.id
    await this.prisma.client.partyCard.upsert({
      where: { id: cardId },
      create: { id: cardId, sessionId: session.id, data: jsonData },
      update: { data: jsonData },
    })
  }

  async card(id: string, viewerKey: string) {
    const cardId = 'card_' + id
    const stored = await this.prisma.client.partyCard.findUnique({ where: { id: cardId } })
    if (stored && stored.data) return stored.data

    const session = await this.findSession(id)
    if (session) {
      const players = await this.playersOf(id)
      if (players.length) return this.buildCard(session, players)
    }
    return this.emptyCard(id)
  }
}
