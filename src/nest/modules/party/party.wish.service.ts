/**
 * 星愿：我的星愿（每日限改 1 次）/ 星愿墙（种子 + 真实星愿合池，小时级轮换）/ 点赞（复合唯一幂等）
 * - 全部 200 裸回包；wall 项 id：种子原样（w_xx），用户星愿 'wish_'+真实id
 */
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { StarWish } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { WISH_THEMES } from './data/constants'
import { WISH_WALL } from './data/wishes'
import { dayKey, genId, hourIndex, shuffleSeed } from './party.util'

const DEFAULT_THEME = '愿望'

interface WallItem {
  id: string
  text: string
  theme: string
  author: string
  likes: number
  liked: boolean
}

@Injectable()
export class PartyWishService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------- 渲染 ---------- */
  private renderWish(w: StarWish | null) {
    if (!w) return { text: '', theme: DEFAULT_THEME, updatedAt: 0, updateDate: '' }
    return {
      text: w.text,
      theme: w.theme || DEFAULT_THEME,
      updatedAt: w.updatedAt.getTime(),
      updateDate: w.updateKey || '',
    }
  }

  private cleanTheme(v: unknown): string {
    const t = typeof v === 'string' ? v.trim() : ''
    return (WISH_THEMES as string[]).indexOf(t) >= 0 ? t : DEFAULT_THEME
  }

  private cleanText(v: unknown): string {
    const t = typeof v === 'string' ? v.trim() : ''
    return t.slice(0, 40) // PRD 4.8：≤40 字
  }

  /* ---------- GET /wish ---------- */
  async myWish(clientKey: string) {
    const row = await this.prisma.client.starWish.findUnique({ where: { clientKey } })
    return this.renderWish(row)
  }

  /* ---------- PUT /wish（当日限改：二次写返回库中旧记录） ---------- */
  async saveWish(body: Record<string, unknown> | null | undefined, clientKey: string) {
    const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const text = this.cleanText(src.text)
    const theme = this.cleanTheme(src.theme)
    const today = dayKey()
    const existing = await this.prisma.client.starWish.findUnique({ where: { clientKey } })
    if (existing && existing.updateKey === today) return this.renderWish(existing)
    const data = { text, theme, updatedAt: new Date(), updateKey: today }
    const row = existing
      ? await this.prisma.client.starWish.update({ where: { clientKey }, data })
      : await this.prisma.client.starWish.create({
          data: { id: genId(), clientKey, text, theme, updatedAt: data.updatedAt, updateKey: today },
        })
    return this.renderWish(row)
  }

  /* ---------- GET /wish/wall（裸数组） ---------- */
  async wall(viewerKey: string): Promise<WallItem[]> {
    const rows = await this.prisma.client.starWish.findMany({ orderBy: { updatedAt: 'desc' }, take: 40 })
    const keys = rows.map((r) => r.clientKey)
    const profiles = keys.length
      ? await this.prisma.client.partyProfile.findMany({ where: { clientKey: { in: keys } } })
      : []
    const nameOf = new Map(profiles.map((p) => [p.clientKey, p.name]))

    // 一次 like 批量查询 → 计数 map + viewer 点过集合
    const userItems: WallItem[] = rows.map((r) => ({
      id: 'wish_' + r.id,
      text: r.text,
      theme: r.theme || DEFAULT_THEME,
      author: nameOf.get(r.clientKey) || '星河旅人',
      likes: 0,
      liked: false,
    }))
    const seedItems: WallItem[] = (WISH_WALL as unknown as WallItem[]).map((w) => ({
      id: w.id,
      text: w.text,
      theme: w.theme,
      author: w.author,
      likes: w.likes,
      liked: false,
    }))
    const ids = userItems.map((i) => i.id).concat(seedItems.map((i) => i.id))
    const likeRows = ids.length
      ? await this.prisma.client.starWishLike.findMany({ where: { wishId: { in: ids } } })
      : []
    const countOf = new Map<string, number>()
    const likedOf = new Set<string>()
    likeRows.forEach((l) => {
      countOf.set(l.wishId, (countOf.get(l.wishId) || 0) + 1)
      if (l.clientKey === viewerKey) likedOf.add(l.wishId)
    })
    const withLike = (item: WallItem): WallItem => ({
      ...item,
      likes: item.likes + (countOf.get(item.id) || 0),
      liked: likedOf.has(item.id),
    })

    // 小时级轮换顺序（镜像 mock：'wall_' + dayKey + '_' + hourIndex）
    return shuffleSeed(userItems.concat(seedItems).map(withLike), 'wall_' + dayKey() + '_' + hourIndex())
  }

  /* ---------- POST /wish/:id/like（wishId_clientKey 复合唯一幂等） ---------- */
  async like(id: string, clientKey: string) {
    const wishId = String(id || '').trim()
    try {
      await this.prisma.client.starWishLike.create({ data: { id: genId(), wishId, clientKey } })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code !== 'P2002') throw new InternalServerErrorException() // 重复点赞静默幂等，其余正常抛
    }
    return { ok: true }
  }
}
