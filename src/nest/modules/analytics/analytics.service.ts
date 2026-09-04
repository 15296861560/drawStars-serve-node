import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { serializeBigInt } from '../../../lib/serialize'
import {
  buildSessionUuid,
  fillDateBuckets,
  getClientIp,
  newWebsiteUuid,
  normalizeReferrer,
  parseUserAgent,
  truncate
} from './analytics.util'

type WebsiteRow = {
  website_id: number
  website_uuid: string
  name: string
  domain: string | null
  share_id: string | null
  created_at: Date | null
}

type SessionRow = {
  session_id: number
  session_uuid: string
  website_id: number
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return this.prisma.client
  }

  private mapWebsite(row: WebsiteRow) {
    return {
      websiteId: Number(row.website_id),
      websiteUuid: row.website_uuid,
      name: row.name,
      domain: row.domain,
      shareId: row.share_id,
      createdAt: row.created_at
    }
  }

  async ensureDefaultWebsite() {
    const rows = await this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
      `SELECT COUNT(*) AS c FROM analytics_website`
    )
    if (Number(rows[0]?.c || 0) > 0) return null
    return this.createWebsite({
      name: 'Draw Stars',
      domain: 'localhost',
      websiteUuid: 'e4daa6d4-3c40-427e-9224-f02464076f49'
    })
  }

  async listWebsites() {
    await this.ensureDefaultWebsite()
    const rows = await this.db().$queryRawUnsafe<WebsiteRow[]>(
      `SELECT * FROM analytics_website ORDER BY website_id ASC`
    )
    return {
      status: true,
      msg: 'ok',
      data: serializeBigInt(rows.map(r => this.mapWebsite(r)))
    }
  }

  async getWebsite(id: number | string) {
    const rows = /^\d+$/.test(String(id))
      ? await this.db().$queryRawUnsafe<WebsiteRow[]>(
          `SELECT * FROM analytics_website WHERE website_id = ? LIMIT 1`,
          Number(id)
        )
      : await this.db().$queryRawUnsafe<WebsiteRow[]>(
          `SELECT * FROM analytics_website WHERE website_uuid = ? LIMIT 1`,
          String(id)
        )
    if (!rows[0]) return { status: false, msg: '网站不存在', data: null }
    return {
      status: true,
      msg: 'ok',
      data: serializeBigInt(this.mapWebsite(rows[0]))
    }
  }

  async createWebsite(body: {
    name: string
    domain?: string
    websiteUuid?: string
  }) {
    if (!body.name?.trim()) {
      return { status: false, msg: '网站名称不能为空', data: null }
    }
    const uuid = body.websiteUuid || newWebsiteUuid()
    await this.db().$executeRawUnsafe(
      `INSERT INTO analytics_website (website_uuid, name, domain, created_at)
       VALUES (?, ?, ?, NOW())`,
      uuid,
      body.name.trim(),
      body.domain?.trim() || null
    )
    const rows = await this.db().$queryRawUnsafe<WebsiteRow[]>(
      `SELECT * FROM analytics_website WHERE website_uuid = ? LIMIT 1`,
      uuid
    )
    return {
      status: true,
      msg: '创建成功',
      data: serializeBigInt(this.mapWebsite(rows[0]))
    }
  }

  async updateWebsite(
    websiteId: number,
    body: { name?: string; domain?: string }
  ) {
    const current = await this.getWebsite(websiteId)
    if (!current.data) return current
    const cur = current.data as { name: string; domain?: string | null }
    const name = body.name != null ? body.name.trim() : cur.name
    const domain =
      body.domain !== undefined
        ? body.domain?.trim() || null
        : (cur.domain ?? null)
    await this.db().$executeRawUnsafe(
      `UPDATE analytics_website SET name = ?, domain = ? WHERE website_id = ?`,
      name,
      domain,
      websiteId
    )
    return this.getWebsite(websiteId)
  }

  async deleteWebsite(websiteId: number) {
    await this.db().$executeRawUnsafe(
      `DELETE FROM analytics_website WHERE website_id = ?`,
      websiteId
    )
    return { status: true, msg: '删除成功', data: null }
  }

  async resetWebsite(websiteId: number) {
    await this.db().$executeRawUnsafe(
      `DELETE FROM analytics_session WHERE website_id = ?`,
      websiteId
    )
    return { status: true, msg: '统计数据已清空', data: null }
  }

  async collect(
    payload: {
      type?: string
      website?: string
      hostname?: string
      screen?: string
      language?: string
      url?: string
      referrer?: string
      title?: string
    },
    req: {
      headers: Record<string, unknown>
      ip?: string
      socket?: { remoteAddress?: string }
    }
  ) {
    const websiteUuid = payload.website
    if (!websiteUuid) {
      return { status: false, msg: '缺少 website', data: null }
    }

    let websiteRes = await this.getWebsite(websiteUuid)
    if (!websiteRes.data) {
      websiteRes = await this.createWebsite({
        name: payload.hostname || 'Default Site',
        domain: payload.hostname || 'localhost',
        websiteUuid
      })
    }
    const website = websiteRes.data as {
      websiteId: number
      websiteUuid: string
      domain?: string
    }
    if (!website?.websiteId) {
      return { status: false, msg: '网站不存在', data: null }
    }

    const ua = String(req.headers['user-agent'] || '')
    const { browser, os, device } = parseUserAgent(ua)
    const ip = getClientIp(req)
    const hostname = truncate(payload.hostname || '', 100)
    const sessionUuid = buildSessionUuid(
      website.websiteId,
      hostname,
      ip,
      ua,
      os
    )

    let sessions = await this.db().$queryRawUnsafe<SessionRow[]>(
      `SELECT session_id, session_uuid, website_id FROM analytics_session
       WHERE session_uuid = ? LIMIT 1`,
      sessionUuid
    )
    if (!sessions[0]) {
      await this.db().$executeRawUnsafe(
        `INSERT INTO analytics_session
         (session_uuid, website_id, created_at, hostname, browser, os, device, screen, language)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
        sessionUuid,
        website.websiteId,
        hostname,
        browser,
        os,
        device,
        truncate(payload.screen || '', 11),
        truncate(payload.language || '', 35)
      )
      sessions = await this.db().$queryRawUnsafe<SessionRow[]>(
        `SELECT session_id, session_uuid, website_id FROM analytics_session
         WHERE session_uuid = ? LIMIT 1`,
        sessionUuid
      )
    }
    const session = sessions[0]

    const type = payload.type || 'pageview'
    if (type === 'pageview' && session) {
      await this.db().$executeRawUnsafe(
        `INSERT INTO analytics_pageview
         (website_id, session_id, created_at, url, referrer, title)
         VALUES (?, ?, NOW(), ?, ?, ?)`,
        website.websiteId,
        Number(session.session_id),
        truncate(payload.url || '/', 500),
        truncate(payload.referrer || '', 500) || null,
        truncate(payload.title || '', 255) || null
      )
    }

    return {
      status: true,
      msg: 'ok',
      data: {
        websiteId: website.websiteId,
        sessionId: Number(session?.session_id || 0),
        sessionUuid
      }
    }
  }

  private parseRange(query: Record<string, string>) {
    const end = query.end_at
      ? new Date(Number(query.end_at) || query.end_at)
      : new Date()
    const start = query.start_at
      ? new Date(Number(query.start_at) || query.start_at)
      : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000)
    const unit = query.unit || 'day'
    // 小时粒度保留滚动时间窗；天/月对齐自然日
    if (unit === 'hour') {
      start.setMinutes(0, 0, 0)
      return { start, end, unit }
    }
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end, unit }
  }

  private async resolveWebsiteId(idOrUuid: string) {
    if (/^\d+$/.test(idOrUuid)) return Number(idOrUuid)
    const res = await this.getWebsite(idOrUuid)
    return (res.data as { websiteId?: number } | null)?.websiteId ?? null
  }

  async getPageviews(idOrUuid: string, query: Record<string, string>) {
    const websiteId = await this.resolveWebsiteId(idOrUuid)
    if (websiteId == null) {
      return { status: false, msg: '网站不存在', data: null }
    }
    const { start, end, unit } = this.parseRange(query)
    const timeFmt = unit === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d'

    const rows = await this.db().$queryRawUnsafe<
      Array<{ t: string; y: bigint | number }>
    >(
      `SELECT DATE_FORMAT(created_at, '${timeFmt}') AS t, COUNT(*) AS y
       FROM analytics_pageview
       WHERE website_id = ? AND created_at BETWEEN ? AND ?
       GROUP BY 1 ORDER BY 1`,
      websiteId,
      start,
      end
    )

    const sessionRows = await this.db().$queryRawUnsafe<
      Array<{ t: string; y: bigint | number }>
    >(
      `SELECT DATE_FORMAT(created_at, '${timeFmt}') AS t, COUNT(DISTINCT session_id) AS y
       FROM analytics_pageview
       WHERE website_id = ? AND created_at BETWEEN ? AND ?
       GROUP BY 1 ORDER BY 1`,
      websiteId,
      start,
      end
    )

    return {
      status: true,
      msg: 'ok',
      data: {
        pageviews: fillDateBuckets(
          rows.map(r => ({ t: String(r.t), y: Number(r.y) })),
          start,
          end,
          unit
        ),
        sessions: fillDateBuckets(
          sessionRows.map(r => ({ t: String(r.t), y: Number(r.y) })),
          start,
          end,
          unit
        )
      }
    }
  }

  async getMetrics(idOrUuid: string, query: Record<string, string>) {
    const websiteId = await this.resolveWebsiteId(idOrUuid)
    if (websiteId == null) {
      return { status: false, msg: '网站不存在', data: null }
    }
    const { start, end } = this.parseRange(query)
    const type = query.type || 'referrer'
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10))

    if (type === 'referrer') {
      const websiteRes = await this.getWebsite(websiteId)
      const domain = (websiteRes.data as { domain?: string } | null)?.domain
      const rows = await this.db().$queryRawUnsafe<
        Array<{ referrer: string | null }>
      >(
        `SELECT referrer FROM analytics_pageview
         WHERE website_id = ? AND created_at BETWEEN ? AND ?`,
        websiteId,
        start,
        end
      )
      const counter = new Map<string, number>()
      for (const row of rows) {
        const name = normalizeReferrer(row.referrer, domain)
        counter.set(name, (counter.get(name) || 0) + 1)
      }
      const list = [...counter.entries()]
        .map(([x, y]) => ({ x, y, name: x, value: y }))
        .sort((a, b) => b.y - a.y)
        .slice(0, limit)
      return { status: true, msg: 'ok', data: this.withPercent(list) }
    }

    if (type === 'url') {
      const rows = await this.db().$queryRawUnsafe<
        Array<{ x: string; y: bigint | number }>
      >(
        `SELECT url AS x, COUNT(*) AS y
         FROM analytics_pageview
         WHERE website_id = ? AND created_at BETWEEN ? AND ?
         GROUP BY url ORDER BY y DESC LIMIT ${limit}`,
        websiteId,
        start,
        end
      )
      const list = rows.map(r => ({
        x: r.x,
        y: Number(r.y),
        name: r.x,
        value: Number(r.y)
      }))
      return {
        status: true,
        msg: 'ok',
        data: this.withPercent(list)
      }
    }

    if (['browser', 'os', 'device', 'country'].includes(type)) {
      const col = type === 'country' ? 'country' : type
      const rows = await this.db().$queryRawUnsafe<
        Array<{ x: string; y: bigint | number }>
      >(
        `SELECT ${col} AS x, COUNT(*) AS y
         FROM analytics_session
         WHERE website_id = ? AND created_at BETWEEN ? AND ?
         GROUP BY ${col} ORDER BY y DESC LIMIT ${limit}`,
        websiteId,
        start,
        end
      )
      const list = rows.map(r => ({
        x: r.x || 'unknown',
        y: Number(r.y),
        name: r.x || 'unknown',
        value: Number(r.y)
      }))
      return { status: true, msg: 'ok', data: this.withPercent(list) }
    }

    return { status: false, msg: `不支持的 type: ${type}`, data: null }
  }

  private withPercent<T extends { y: number }>(list: T[]) {
    const total = list.reduce((s, i) => s + (i.y || 0), 0) || 1
    return list.map(i => ({
      ...i,
      z: Math.round(((i.y || 0) / total) * 1000) / 10
    }))
  }

  async getStats(idOrUuid: string, query: Record<string, string>) {
    const websiteId = await this.resolveWebsiteId(idOrUuid)
    if (websiteId == null) {
      return { status: false, msg: '网站不存在', data: null }
    }
    const { start, end } = this.parseRange(query)
    const duration = end.getTime() - start.getTime()
    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - duration)
    const urlFilter = query.url
      ? ` AND url = '${String(query.url).replace(/'/g, '')}'`
      : ''

    const periodStats = async (from: Date, to: Date) => {
      const [pvRows, uvRows, visitRows, bounceRows, timeRows] =
        await Promise.all([
          this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COUNT(*) AS c FROM analytics_pageview
           WHERE website_id = ? AND created_at BETWEEN ? AND ?${urlFilter}`,
            websiteId,
            from,
            to
          ),
          // 访客：独立会话数
          this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COUNT(DISTINCT session_id) AS c FROM analytics_pageview
           WHERE website_id = ? AND created_at BETWEEN ? AND ?${urlFilter}`,
            websiteId,
            from,
            to
          ),
          // 访问：本时段内有过浏览的会话（与 Umami Visits 对齐；当前模型下≈访客）
          this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COUNT(*) AS c FROM (
             SELECT session_id FROM analytics_pageview
             WHERE website_id = ? AND created_at BETWEEN ? AND ?${urlFilter}
             GROUP BY session_id
           ) t`,
            websiteId,
            from,
            to
          ),
          // 跳出：该时间段内只有 1 次 pageview 的会话数
          this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COUNT(*) AS c FROM (
             SELECT session_id FROM analytics_pageview
             WHERE website_id = ? AND created_at BETWEEN ? AND ?${urlFilter}
             GROUP BY session_id HAVING COUNT(*) = 1
           ) t`,
            websiteId,
            from,
            to
          ),
          // 总会话时长（秒）：每会话 max-min created_at
          this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COALESCE(SUM(secs), 0) AS c FROM (
             SELECT TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS secs
             FROM analytics_pageview
             WHERE website_id = ? AND created_at BETWEEN ? AND ?${urlFilter}
             GROUP BY session_id
           ) t`,
            websiteId,
            from,
            to
          )
        ])
      return {
        pageviews: Number(pvRows[0]?.c || 0),
        uniques: Number(uvRows[0]?.c || 0),
        visits: Number(visitRows[0]?.c || 0),
        bounces: Number(bounceRows[0]?.c || 0),
        totaltime: Number(timeRows[0]?.c || 0)
      }
    }

    const [cur, prev] = await Promise.all([
      periodStats(start, end),
      periodStats(prevStart, prevEnd)
    ])

    return {
      status: true,
      msg: 'ok',
      data: {
        pageviews: {
          value: cur.pageviews,
          change: cur.pageviews - prev.pageviews
        },
        uniques: { value: cur.uniques, change: cur.uniques - prev.uniques },
        visits: { value: cur.visits, change: cur.visits - prev.visits },
        bounces: { value: cur.bounces, change: cur.bounces - prev.bounces },
        totaltime: {
          value: cur.totaltime,
          change: cur.totaltime - prev.totaltime
        }
      }
    }
  }

  /** 近 5 分钟活跃访客 */
  async getActive(idOrUuid: string) {
    const websiteId = await this.resolveWebsiteId(idOrUuid)
    if (websiteId == null) {
      return { status: false, msg: '网站不存在', data: null }
    }
    const since = new Date(Date.now() - 5 * 60 * 1000)
    const rows = await this.db().$queryRawUnsafe<Array<{ c: bigint | number }>>(
      `SELECT COUNT(DISTINCT session_id) AS c FROM analytics_pageview
       WHERE website_id = ? AND created_at >= ?`,
      websiteId,
      since
    )
    return {
      status: true,
      msg: 'ok',
      data: [{ x: Number(rows[0]?.c || 0) }]
    }
  }

  async getHomeCharts() {
    await this.ensureDefaultWebsite()
    const list = await this.listWebsites()
    const website = (list.data as Array<{ websiteId: number }> | null)?.[0]
    if (!website) {
      return {
        status: true,
        msg: 'ok',
        data: { pageviews: [], referrers: [], website: null }
      }
    }
    const end = new Date()
    const start = new Date(end.getTime() - 6 * 86400000)
    const [pvRes, refRes] = await Promise.all([
      this.getPageviews(String(website.websiteId), {
        start_at: String(start.getTime()),
        end_at: String(end.getTime()),
        unit: 'day'
      }),
      this.getMetrics(String(website.websiteId), {
        type: 'referrer',
        start_at: String(start.getTime()),
        end_at: String(end.getTime()),
        limit: '8'
      })
    ])
    return {
      status: true,
      msg: 'ok',
      data: {
        website,
        pageviews: pvRes.data?.pageviews || [],
        sessions: pvRes.data?.sessions || [],
        referrers: refRes.data || []
      }
    }
  }
}
