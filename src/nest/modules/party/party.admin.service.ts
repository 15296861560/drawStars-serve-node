/**
 * Admin 域服务（PRD 7.1.4 / 4.10 运营后台最小集）
 * - 鉴权：x-admin-key 单 key（PARTY_ADMIN_KEY 覆盖，RBAC 六码留待 drawStars-Vue3 接入）
 * - 回包：统一 {code, msg, data}，HTTP 恒 200，业务码 0 = 成功
 * - 惰性 seed：game-config 首次 GET 补 5 行；themes 首次 GET 补 PRD 七标签
 * - 消费侧连线：session.create 查询 game-config（软灰度载体，方法本表见 ensureSeededGameConfig）
 */
import { Injectable } from '@nestjs/common'
import config from '../../../config/publish-config'
import { PrismaService } from '../../prisma/prisma.service'
import { GAME_MAP, LEVELS, TOD_THEMES } from './data/constants'
import { clampInt, gatherList, genId, parseBodyList } from './party.util'

const GAME_KEYS = Object.keys(GAME_MAP as Record<string, unknown>)
const KIND_KEYS = ['truth', 'dare']
const QUESTION_STATUS = ['online', 'offline', 'pending_review']
const REPORT_STATUS = ['pending', 'reviewing', 'closed']

/** 段位分桶（PRD 4.9 表；星光值发放量依赖 points 流水，后续接 PointsService） */
const RANK_BUCKETS = [
  { key: 'newcomer', label: '拾星新人', min: 0, max: 99 },
  { key: 'envoy', label: '星光使者', min: 100, max: 499 },
  { key: 'guardian', label: '星愿守护者', min: 500, max: 1999 },
  { key: 'captain', label: '宇宙队长', min: 2000, max: Number.MAX_SAFE_INTEGER },
]

/** themes 惰性 seed（PRD L249 七标签，scene='question'） */
const THEME_SEEDS = [
  { tagKey: 'qingchun', name: '青春' },
  { tagKey: 'anlian', name: '暗恋' },
  { tagKey: 'shenye', name: '深夜' },
  { tagKey: 'lvxing', name: '旅行' },
  { tagKey: 'weilai', name: '未来' },
  { tagKey: 'yihan', name: '遗憾' },
  { tagKey: 'yuanwang', name: '愿望' },
]

const DEFAULT_ROUNDS_ADMIN: Record<string, number> = { tod: 8, draw: 5, lady: 0, bluff: 5, dice: 0 }

@Injectable()
export class PartyAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------- wrap / 分页 ---------- */
  private ok(data: unknown) {
    return { code: 0, msg: 'ok', data: data ?? {} }
  }

  private fail(code: number, msg: string) {
    return { code, msg, data: {} }
  }

  private pageArgs(query: Record<string, unknown>) {
    const page = clampInt(query.page, 1, 100000, 1)
    const pageSize = clampInt(query.pageSize, 1, 100, 20)
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
  }

  private pageWrap<T>(items: T[], total: number, page: number, pageSize: number) {
    return { items, total, page, pageSize }
  }

  private str(v: unknown, max: number, fallback = ''): string {
    if (typeof v !== 'string') return fallback
    const s = v.trim()
    return s.length <= max ? s : s.slice(0, max)
  }

  /* ---------- game-config 惰性 seed（消费侧软灰度共用） ---------- */
  private async ensureSeededGameConfig() {
    const count = await this.prisma.client.partyGameConfig.count()
    if (count >= GAME_KEYS.length) return
    const existing = new Set(
      (await this.prisma.client.partyGameConfig.findMany({ select: { gameType: true } })).map(r => r.gameType)
    )
    for (const gt of GAME_KEYS) {
      if (existing.has(gt)) continue
      await this.prisma.client.partyGameConfig.create({
        data: {
          id: genId(),
          gameType: gt,
          status: 'online',
          playerLimit: gt === 'dice' || gt === 'lady' ? 8 : 8,
          roundLimit: DEFAULT_ROUNDS_ADMIN[gt] != null ? DEFAULT_ROUNDS_ADMIN[gt] : 5,
          level: 'standard',
          penaltyText: gt === 'tod' || gt === 'bluff' ? '向左侧邻座喝一杯' : '',
        },
      })
    }
  }

  /* ---------- 题目池 ---------- */
  async listQuestions(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    const where: Record<string, unknown> = {}
    if (typeof q.gameType === 'string' && q.gameType) where.gameType = q.gameType
    if (typeof q.kind === 'string' && q.kind) where.kind = q.kind
    if (typeof q.level === 'string' && q.level) where.level = q.level
    if (typeof q.status === 'string' && q.status) where.status = q.status
    if (typeof q.keyword === 'string' && q.keyword.trim()) {
      where.text = { contains: q.keyword.trim() }
    }
    const { page, pageSize, skip, take } = this.pageArgs(q)
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.partyQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.partyQuestion.count({ where }),
    ])
    return this.ok(this.pageWrap(items, total, page, pageSize))
  }

  /** POST：单条对象或 {items:[...]} 批量；非法行跳过并回显原因（校验失败整行回显） */
  async createQuestions(body: Record<string, unknown> | null | undefined) {
    const src = body || {}
    const rows: unknown[] = Array.isArray(src.items)
      ? (src.items as unknown[])
      : [src]
    const valid: {
      gameType: string
      kind: string
      level: string
      themes: string[]
      text: string
      status: string
    }[] = []
    const skipped: { index: number; reason: string }[] = []
    rows.forEach((row, index) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const gameType = typeof r.gameType === 'string' ? r.gameType : 'tod'
      const kind = typeof r.kind === 'string' ? r.kind : 'truth'
      const level = typeof r.level === 'string' ? r.level : 'standard'
      const text = typeof r.text === 'string' ? r.text.trim() : ''
      const themes = parseBodyList(gatherList(r, 'themes')).length
        ? parseBodyList(gatherList(r, 'themes'))
        : Array.isArray(r.themes)
          ? (r.themes as unknown[]).filter((x): x is string => typeof x === 'string')
          : []
      const status = typeof r.status === 'string' && QUESTION_STATUS.includes(r.status) ? r.status : 'online'
      if (GAME_KEYS.indexOf(gameType) < 0) return skipped.push({ index, reason: 'invalid gameType' })
      if (KIND_KEYS.indexOf(kind) < 0) return skipped.push({ index, reason: 'invalid kind' })
      const levelKeys = LEVELS.map((l: { key: string }) => l.key)
      if (levelKeys.indexOf(level) < 0) return skipped.push({ index, reason: 'invalid level' })
      if (!text) return skipped.push({ index, reason: 'text required' })
      valid.push({ gameType, kind, level, themes, text, status })
    })
    const items = valid.length
      ? await this.prisma.client.partyQuestion.createMany({
          data: valid.map(v => ({
            id: genId(),
            gameType: v.gameType,
            kind: v.kind,
            level: v.level,
            themes: v.themes,
            text: v.text,
            status: v.status,
          })),
        })
      : { count: 0 }
    return this.ok({ created: items.count, skipped })
  }

  async updateQuestion(id: string, body: Record<string, unknown> | null | undefined) {
    const row = await this.prisma.client.partyQuestion.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'question not found')
    const src = body || {}
    const data: Record<string, unknown> = {}
    if (typeof src.kind === 'string' && KIND_KEYS.includes(src.kind)) data.kind = src.kind
    if (typeof src.level === 'string' && LEVELS.map((l: { key: string }) => l.key).includes(src.level)) data.level = src.level
    if (typeof src.text === 'string' && src.text.trim()) data.text = this.str(src.text, 512)
    if (src.themes !== undefined) {
      data.themes = Array.isArray(src.themes)
        ? (src.themes as unknown[]).filter((x): x is string => typeof x === 'string')
        : parseBodyList(src.themes)
    }
    if (typeof src.status === 'string' && QUESTION_STATUS.includes(src.status)) data.status = src.status
    const updated = Object.keys(data).length
      ? await this.prisma.client.partyQuestion.update({ where: { id }, data })
      : row
    return this.ok(updated)
  }

  async deleteQuestion(id: string) {
    const row = await this.prisma.client.partyQuestion.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'question not found')
    await this.prisma.client.partyQuestion.delete({ where: { id } })
    return this.ok({ deleted: true, id })
  }

  /* ---------- 词库 ---------- */
  async listWordbank(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    const where: Record<string, unknown> = {}
    if (typeof q.level === 'string' && q.level) where.level = q.level
    if (typeof q.theme === 'string' && q.theme) where.theme = q.theme
    if (typeof q.status === 'string' && q.status) where.status = q.status
    if (typeof q.keyword === 'string' && q.keyword.trim()) {
      where.word = { contains: q.keyword.trim() }
    }
    const { page, pageSize, skip, take } = this.pageArgs(q)
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.partyWordbank.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.client.partyWordbank.count({ where }),
    ])
    return this.ok(this.pageWrap(items, total, page, pageSize))
  }

  async createWordbank(body: Record<string, unknown> | null | undefined) {
    const src = body || {}
    const rows: unknown[] = Array.isArray(src.items) ? (src.items as unknown[]) : [src]
    const valid: { level: string; theme: string; word: string; status: string }[] = []
    const skipped: { index: number; reason: string }[] = []
    rows.forEach((row, index) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const level = typeof r.level === 'string' ? r.level : 'standard'
      const theme = typeof r.theme === 'string' ? this.str(r.theme, 16) : ''
      const word = typeof r.word === 'string' ? this.str(r.word, 64) : ''
      const status = typeof r.status === 'string' && QUESTION_STATUS.includes(r.status) ? r.status : 'online'
      const levelKeys = LEVELS.map((l: { key: string }) => l.key)
      if (levelKeys.indexOf(level) < 0) return skipped.push({ index, reason: 'invalid level' })
      if (!word) return skipped.push({ index, reason: 'word required' })
      valid.push({ level, theme, word, status })
    })
    const items = valid.length
      ? await this.prisma.client.partyWordbank.createMany({
          data: valid.map(v => ({ id: genId(), level: v.level, theme: v.theme, word: v.word, status: v.status })),
        })
      : { count: 0 }
    return this.ok({ created: items.count, skipped })
  }

  async updateWordbank(id: string, body: Record<string, unknown> | null | undefined) {
    const row = await this.prisma.client.partyWordbank.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'wordbank not found')
    const src = body || {}
    const data: Record<string, unknown> = {}
    if (typeof src.level === 'string' && LEVELS.map((l: { key: string }) => l.key).includes(src.level)) data.level = src.level
    if (typeof src.theme === 'string') data.theme = this.str(src.theme, 16)
    if (typeof src.word === 'string' && src.word.trim()) data.word = this.str(src.word, 64)
    if (typeof src.status === 'string' && QUESTION_STATUS.includes(src.status)) data.status = src.status
    const updated = Object.keys(data).length
      ? await this.prisma.client.partyWordbank.update({ where: { id }, data })
      : row
    return this.ok(updated)
  }

  async deleteWordbank(id: string) {
    const row = await this.prisma.client.partyWordbank.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'wordbank not found')
    await this.prisma.client.partyWordbank.delete({ where: { id } })
    return this.ok({ deleted: true, id })
  }

  /* ---------- 主题标签（惰性 seed 七标签） ---------- */
  async listThemes(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    const count = await this.prisma.client.partyThemeTag.count()
    if (count < THEME_SEEDS.length) {
      const existing = new Set(
        (await this.prisma.client.partyThemeTag.findMany({ select: { tagKey: true } })).map(r => r.tagKey)
      )
      for (let i = 0; i < THEME_SEEDS.length; i++) {
        const t = THEME_SEEDS[i]
        if (existing.has(t.tagKey)) continue
        await this.prisma.client.partyThemeTag.create({
          data: { id: genId(), tagKey: t.tagKey, name: t.name, scene: 'question', sort: i },
        })
      }
    }
    const where: Record<string, unknown> = {}
    if (typeof q.scene === 'string' && q.scene) where.scene = q.scene
    if (typeof q.status === 'string' && q.status) where.status = q.status
    const items = await this.prisma.client.partyThemeTag.findMany({
      where,
      orderBy: [{ scene: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    })
    return this.ok({ items, total: items.length })
  }

  async createTheme(body: Record<string, unknown> | null | undefined) {
    const r = body || {}
    const tagKey = this.str(r.tagKey, 32)
    const name = this.str(r.name, 64)
    if (!tagKey || !name) return this.fail(400, 'tagKey and name required')
    const dup = await this.prisma.client.partyThemeTag.findUnique({ where: { tagKey } })
    if (dup) return this.fail(409, 'tagKey already exists')
    const scene = r.scene === 'wish' ? 'wish' : 'question'
    const created = await this.prisma.client.partyThemeTag.create({
      data: {
        id: genId(),
        tagKey,
        name,
        scene,
        color: this.str(r.color, 16),
        emoji: this.str(r.emoji, 16),
        sort: clampInt(r.sort, 0, 9999, 0),
        status: typeof r.status === 'string' ? (r.status === 'offline' ? 'offline' : 'online') : 'online',
      },
    })
    return this.ok(created)
  }

  async updateTheme(id: string, body: Record<string, unknown> | null | undefined) {
    const row = await this.prisma.client.partyThemeTag.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'theme not found')
    const src = body || {}
    const data: Record<string, unknown> = {}
    if (typeof src.name === 'string' && src.name.trim()) data.name = this.str(src.name, 64)
    if (typeof src.scene === 'string') data.scene = src.scene === 'wish' ? 'wish' : 'question'
    if (typeof src.color === 'string') data.color = this.str(src.color, 16)
    if (typeof src.emoji === 'string') data.emoji = this.str(src.emoji, 16)
    if (src.sort !== undefined) data.sort = clampInt(src.sort, 0, 9999, row.sort)
    if (typeof src.status === 'string') data.status = src.status === 'offline' ? 'offline' : 'online'
    const updated = Object.keys(data).length
      ? await this.prisma.client.partyThemeTag.update({ where: { id }, data })
      : row
    return this.ok(updated)
  }

  async deleteTheme(id: string) {
    const row = await this.prisma.client.partyThemeTag.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'theme not found')
    await this.prisma.client.partyThemeTag.delete({ where: { id } })
    return this.ok({ deleted: true, id })
  }

  /* ---------- 游戏配置（软灰度载体：session.create 消费 status） ---------- */
  async listGameConfig() {
    await this.ensureSeededGameConfig()
    const items = await this.prisma.client.partyGameConfig.findMany({ orderBy: { gameType: 'asc' } })
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    return this.ok({
      items: items.map(r => ({
        ...r,
        gameName: (gameMap[r.gameType] && gameMap[r.gameType].name) || r.gameType,
        gameEmoji: (gameMap[r.gameType] && gameMap[r.gameType].emoji) || '',
      })),
    })
  }

  async updateGameConfig(gameType: string, body: Record<string, unknown> | null | undefined) {
    await this.ensureSeededGameConfig()
    if (GAME_KEYS.indexOf(gameType) < 0) return this.fail(400, 'invalid gameType')
    const row = await this.prisma.client.partyGameConfig.findUnique({ where: { gameType } })
    if (!row) return this.fail(404, 'game config not found')
    const src = body || {}
    const data: Record<string, unknown> = {}
    if (typeof src.status === 'string') {
      if (!(src.status === 'online' || src.status === 'offline')) return this.fail(400, 'invalid status')
      data.status = src.status
    }
    if (src.playerLimit !== undefined) data.playerLimit = clampInt(src.playerLimit, 2, 8, row.playerLimit)
    if (src.roundLimit !== undefined) data.roundLimit = clampInt(src.roundLimit, 0, 50, row.roundLimit)
    if (typeof src.level === 'string' && LEVELS.map((l: { key: string }) => l.key).includes(src.level)) data.level = src.level
    if (typeof src.penaltyText === 'string') data.penaltyText = this.str(src.penaltyText, 255)
    if (src.extra && typeof src.extra === 'object' && !Array.isArray(src.extra)) data.extra = src.extra
    const updated = Object.keys(data).length
      ? await this.prisma.client.partyGameConfig.update({ where: { gameType }, data })
      : row
    return this.ok(updated)
  }

  /** 消费侧软灰度：查 gameType 可用性（session.create 接线用；表空则放行） */
  async checkGameOnline(gameType: string): Promise<null | { gameName: string; hint: string }> {
    try {
      const row = await this.prisma.client.partyGameConfig.findUnique({ where: { gameType } })
      if (!row || row.status === 'online') return null
      const gameMap = GAME_MAP as Record<string, { name: string }>
      return {
        gameName: (gameMap[gameType] && gameMap[gameType].name) || gameType,
        hint: '该玩法正在装修中控台，去玩别的游戏吧',
      }
    } catch {
      return null // Admin 域不可用时放行（软灰度不阻断开房）
    }
  }

  /* ---------- 对局查询 ---------- */
  async listSessions(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    const where: Record<string, unknown> = {}
    if (typeof q.status === 'string' && q.status) where.status = q.status
    if (typeof q.gameType === 'string' && q.gameType) where.gameType = q.gameType
    if (typeof q.code === 'string' && q.code.trim()) where.code = q.code.trim()
    const { page, pageSize, skip, take } = this.pageArgs(q)
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.partySession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { players: true },
      }),
      this.prisma.client.partySession.count({ where }),
    ])
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    return this.ok(
      this.pageWrap(
        items.map(s => ({
          id: s.id,
          code: s.code,
          gameType: s.gameType,
          gameName: (gameMap[s.gameType] && gameMap[s.gameType].name) || s.gameType,
          status: s.status,
          level: s.level,
          rounds: s.rounds,
          currentRound: s.currentRound,
          playerLimit: s.playerLimit,
          playersCount: s.players.length,
          createdAt: s.createdAt,
          startedAt: s.startedAt,
          closedAt: s.closedAt,
          players: s.players.map(p => ({
            id: p.id,
            clientKey: p.clientKey,
            name: p.name,
            isHost: p.isHost,
            online: p.online,
            absent: p.absent,
            joinedAt: p.createdAt,
          })),
        })),
        total,
        page,
        pageSize
      )
    )
  }

  async getSessionDetail(id: string) {
    const s = await this.prisma.client.partySession.findUnique({ where: { id }, include: { players: true } })
    if (!s) return this.fail(404, 'session not found')
    const rounds = await this.prisma.client.partyRound.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' },
    })
    const gameMap = GAME_MAP as Record<string, { name: string; emoji: string }>
    return this.ok({
      id: s.id,
      code: s.code,
      gameType: s.gameType,
      gameName: (gameMap[s.gameType] && gameMap[s.gameType].name) || s.gameType,
      gameEmoji: (gameMap[s.gameType] && gameMap[s.gameType].emoji) || '',
      status: s.status,
      level: s.level,
      rounds: s.rounds,
      currentRound: s.currentRound,
      playerLimit: s.playerLimit,
      penaltyText: s.penaltyText,
      createdAt: s.createdAt,
      startedAt: s.startedAt,
      closedAt: s.closedAt,
      players: s.players.map(p => ({
        id: p.id,
        clientKey: p.clientKey,
        name: p.name,
        avatarUrl: p.avatarUrl,
        ready: p.ready,
        isHost: p.isHost,
        online: p.online,
        absent: p.absent,
        joinedAt: p.createdAt,
      })),
      roundRecords: rounds,
    })
  }

  /* ---------- 数据统计（PRD 4.10 口径；星光值发放量待 PointsService 占位 0） ---------- */
  private parseDate(v: unknown, fb: Date): Date {
    if (typeof v === 'string' && v.trim()) {
      const s = v.trim()
      if (/^\d{8}$/.test(s)) return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
      if (m) return new Date(+m[1], +m[2] - 1, +m[3])
    }
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return new Date(n)
    return fb
  }

  async stats(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    // 默认最近 7 天（起于当日 00:00 - 6 天；end 排他到次日 00:00）
    const now = new Date()
    const defStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    const defEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const start = this.parseDate(q.start, defStart)
    let end = this.parseDate(q.end, defEnd)
    if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 86400000)

    // 一次拉取范围窗口内全部 session 行，JS 聚合（窗口默认 7 天，数据量可控）
    const sessions = await this.prisma.client.partySession.findMany({
      where: {
        OR: [
          { startedAt: { gte: start, lt: end } },
        ],
      },
      select: { gameType: true, status: true, startedAt: true },
    })
    const waiting = await this.prisma.client.partySession.count({
      where: { status: 'WAITING', createdAt: { gte: start, lt: end } },
    })

    const played = sessions.length
    const finished = sessions.filter(s => s.status === 'SETTLING' || s.status === 'CLOSED').length
    const byGame: Record<string, number> = {}
    for (const s of sessions) {
      byGame[s.gameType] = (byGame[s.gameType] || 0) + 1
    }
    // 日趋势：以 startedAt 所在日为轴
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
    const trend: { date: string; sessions: number }[] = []
    for (let i = 0; i < dayCount; i++) {
      const lo = new Date(start.getTime() + i * 86400000)
      const hi = new Date(lo.getTime() + 86400000)
      const c = sessions.filter(
        s => s.startedAt && s.startedAt >= lo && s.startedAt < hi
      ).length
      trend.push({ date: this.fmtDay(lo), sessions: c })
    }

    // 日活：窗口内 player 建席去重 clientKey（PRD 1.3 口径近似：参与 ≥1 session）
    const joinRows = await this.prisma.client.partySessionPlayer.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { clientKey: true },
    })
    const activeUsers = new Set(joinRows.map(r => r.clientKey)).size

    // 段位分布：全部 profile starVal 分桶（日切快照）
    const profiles = await this.prisma.client.partyProfile.findMany({ select: { starVal: true } })
    const rankDist = RANK_BUCKETS.map(b => ({
      key: b.key,
      label: b.label,
      users: profiles.filter(p => p.starVal >= b.min && p.starVal <= b.max).length,
    }))

    return this.ok({
      range: { start, end },
      sessions: { total: played, waiting, finished, finishedRate: played ? +(finished / played).toFixed(4) : 0 },
      byGame,
      trend,
      activeUsers,
      starValueGrant: 0, // 星光值发放量：待 PointsService 接线（PRD 4.10）
      rankDist,
    })
  }

  private fmtDay(d: Date): string {
    const p = (n: number) => (n < 10 ? '0' + n : String(n))
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  }

  /* ---------- 内容审核（举报状态机 pending→reviewing→closed） ---------- */
  async listReports(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    const where: Record<string, unknown> = {}
    if (typeof q.status === 'string' && q.status) where.status = q.status
    if (typeof q.targetType === 'string' && q.targetType) where.targetType = q.targetType
    const { page, pageSize, skip, take } = this.pageArgs(q)
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.partyReport.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.client.partyReport.count({ where }),
    ])
    return this.ok(this.pageWrap(items, total, page, pageSize))
  }

  /** 玩家上报通道（小程序上报端点后续接线；Admin 侧先具备处理闭环） */
  async createReport(body: Record<string, unknown> | null | undefined) {
    const r = body || {}
    const targetType = this.str(r.targetType, 32)
    const targetId = this.str(r.targetId, 32)
    const reason = this.str(r.reason, 32) || 'other'
    if (!targetType || !targetId) return this.fail(400, 'targetType and targetId required')
    const created = await this.prisma.client.partyReport.create({
      data: {
        id: genId(),
        targetType,
        targetId,
        sessionId: this.str(r.sessionId, 32) || null,
        reason,
        description: this.str(r.description, 512),
      },
    })
    return this.ok(created)
  }

  async handleReport(id: string, body: Record<string, unknown> | null | undefined) {
    const row = await this.prisma.client.partyReport.findUnique({ where: { id } })
    if (!row) return this.fail(404, 'report not found')
    const src = body || {}
    const action = typeof src.action === 'string' ? src.action : ''
    const data: Record<string, unknown> = {}
    // 状态机：pending --review--> reviewing --close--> closed；pending 允许直审直结
    if (action === 'review') {
      if (row.status !== 'pending') return this.fail(409, `illegal transition: ${row.status} -> reviewing`)
      data.status = 'reviewing'
    } else if (action === 'close') {
      if (row.status === 'closed') return this.fail(409, 'report already closed')
      data.status = 'closed'
    } else {
      return this.fail(400, 'action must be review|close')
    }
    data.handledBy = this.str(src.handledBy, 64) || 'admin'
    data.handleNote = this.str(src.handleNote, 512)
    // 联动处置：targetAction=offline（题目/词条下架 pending_review）/ delete（删行）
    const targetAction = typeof src.targetAction === 'string' ? src.targetAction : ''
    let targetResult: unknown = null
    if (action === 'close' && targetAction) {
      if (targetAction === 'offline') {
        if (row.targetType === 'question') {
          targetResult = await this.prisma.client.partyQuestion.updateMany({
            where: { id: row.targetId },
            data: { status: 'offline' },
          })
        } else if (row.targetType === 'wordbank') {
          targetResult = await this.prisma.client.partyWordbank.updateMany({
            where: { id: row.targetId },
            data: { status: 'offline' },
          })
        }
      } else if (targetAction === 'delete') {
        if (row.targetType === 'question') {
          targetResult = await this.prisma.client.partyQuestion.deleteMany({ where: { id: row.targetId } })
        } else if (row.targetType === 'wordbank') {
          targetResult = await this.prisma.client.partyWordbank.deleteMany({ where: { id: row.targetId } })
        }
      }
    }
    const updated = await this.prisma.client.partyReport.update({ where: { id }, data })
    return this.ok({ report: updated, target: targetResult })
  }

  /* ---------- 鉴权 ---------- */
  checkAdminKey(key: unknown): boolean {
    return typeof key === 'string' && key.length > 0 && key === config.admin_key
  }
}
