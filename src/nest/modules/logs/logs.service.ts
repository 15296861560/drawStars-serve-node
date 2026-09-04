import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { serializeBigInt } from '../../../lib/serialize'
import Log, { LOG_TYPE } from '../../../public/provider/log'
import {
  normalizeHttpMethod,
  normalizeOperationType
} from '../../../public/provider/log-operation'

type QueryParams = {
  curPage?: number | string
  pageSize?: number | string
  startTime?: string | number
  endTime?: string | number
  timeRange?: string | string[]
  username?: string
  operation?: string
  status?: string
  module?: string
  type?: string
  operator?: string
  method?: string
  ip?: string
  url?: string
  keyword?: string
  /** 仅登录/登出相关（登录日志页） */
  loginOnly?: boolean | string
  [key: string]: unknown
}

/** 前端操作类型 → content 匹配关键词（兼容历史混乱写法） */
const OPERATION_KEYWORDS: Record<string, string[]> = {
  insert: [
    '"operation":"insert"',
    'insert',
    'create',
    'register',
    '新增',
    '添加'
  ],
  update: ['"operation":"update"', 'update', 'modify', 'bind', '修改', '更新'],
  delete: ['"operation":"delete"', 'delete', 'cancel', '删除', '移除'],
  select: ['"operation":"select"', 'select', 'query', 'list', '查询', '获取'],
  login: ['"operation":"login"', 'login', '登录', 'signin'],
  logout: ['"operation":"logout"', 'logout', '登出', 'signout'],
  other: ['"operation":"other"']
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  private parsePage(params: QueryParams) {
    const curPage = Math.max(1, Number(params.curPage) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    return { curPage, pageSize, skip: (curPage - 1) * pageSize }
  }

  /** 规范化查询参数：空值清理、timeRange → start/end */
  private normalizeParams(params: QueryParams): QueryParams {
    const next: QueryParams = { ...params }

    for (const key of Object.keys(next)) {
      const val = next[key]
      if (val === '' || val == null) {
        delete next[key]
        continue
      }
      if (Array.isArray(val) && val.length === 0) {
        delete next[key]
      }
    }

    let range = next.timeRange as string | string[] | undefined
    if (typeof range === 'string') {
      const trimmed = range.trim()
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          range = JSON.parse(trimmed) as string[]
        } catch {
          range = trimmed
            .split(/[,~]/)
            .map(s => s.trim())
            .filter(Boolean)
        }
      } else {
        range = trimmed
          .split(/[,~]/)
          .map(s => s.trim())
          .filter(Boolean)
      }
    }
    if (Array.isArray(range) && range.length >= 2) {
      if (!next.startTime) next.startTime = range[0]
      if (!next.endTime) next.endTime = range[1]
    }
    delete next.timeRange

    if (next.loginOnly === 'true' || next.loginOnly === '1') {
      next.loginOnly = true
    }

    return next
  }

  private parseTimeBound(
    value: string | number,
    endOfDay = false
  ): bigint | null {
    if (value == null || value === '') return null
    const raw = String(value).trim()
    let ms: number
    if (/^\d+$/.test(raw)) {
      ms = Number(raw)
      // 秒级时间戳
      if (raw.length <= 10) ms *= 1000
    } else {
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return null
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        d.setHours(23, 59, 59, 999)
      }
      ms = d.getTime()
    }
    if (!Number.isFinite(ms)) return null
    return BigInt(ms)
  }

  private contentContainsAny(keywords: string[]): Prisma.LogWhereInput {
    const unique = [
      ...new Set(keywords.map(k => String(k).trim()).filter(Boolean))
    ]
    if (!unique.length) return {}
    if (unique.length === 1) {
      return { content: { contains: unique[0] } }
    }
    return { OR: unique.map(k => ({ content: { contains: k } })) }
  }

  /** JSON 字段模糊匹配（兼容有无空格的序列化） */
  private jsonFieldContains(
    field: string,
    value: string
  ): Prisma.LogWhereInput {
    const v = String(value).trim()
    if (!v) return {}
    return {
      OR: [
        { content: { contains: `"${field}":"${v}"` } },
        { content: { contains: `"${field}": "${v}"` } },
        { content: { contains: `"${field}":${JSON.stringify(v)}` } },
        { content: { contains: v } }
      ]
    }
  }

  private parseContent(
    raw: string | null | undefined
  ): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : { value: parsed }
    } catch {
      return { raw }
    }
  }

  private formatTime(ts: bigint | number | null | undefined) {
    if (ts == null) return ''
    const n = Number(ts)
    if (!n) return ''
    const d = new Date(n)
    const pad = (v: number) => String(v).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  private buildWhere(
    logType: string,
    params: QueryParams
  ): Prisma.LogWhereInput {
    const p = this.normalizeParams(params)
    const where: Prisma.LogWhereInput = { logType }
    const and: Prisma.LogWhereInput[] = []

    const start =
      p.startTime != null ? this.parseTimeBound(p.startTime, false) : null
    if (start != null) {
      and.push({ createTime: { gte: start } })
    }
    const end = p.endTime != null ? this.parseTimeBound(p.endTime, true) : null
    if (end != null) {
      and.push({ createTime: { lte: end } })
    }

    if (p.url) {
      and.push({ originalUrl: { contains: String(p.url) } })
    }

    if (p.username) {
      and.push(this.jsonFieldContains('username', String(p.username)))
    }
    if (p.operator) {
      and.push({
        OR: [
          this.jsonFieldContains('operator', String(p.operator)),
          this.jsonFieldContains('username', String(p.operator))
        ]
      })
    }
    if (p.ip) {
      const ip = String(p.ip).trim()
      and.push({
        OR: [
          { content: { contains: `"ip":"${ip}"` } },
          { content: { contains: `"ip": "${ip}"` } },
          { content: { contains: ip } },
          { hostname: { contains: ip } }
        ]
      })
    }
    if (p.status) {
      const status = String(p.status).trim().toLowerCase()
      if (status === 'success' || status === 'ok' || status === 'true') {
        and.push({
          OR: [
            { content: { contains: '"status":"success"' } },
            { content: { contains: '"status": "success"' } },
            { content: { contains: '"result":true' } },
            { content: { contains: '"result": true' } }
          ],
          NOT: {
            OR: [
              { content: { contains: '"status":"fail"' } },
              { content: { contains: '"status":"error"' } }
            ]
          }
        })
      } else if (
        status === 'fail' ||
        status === 'error' ||
        status === 'false'
      ) {
        and.push({
          OR: [
            { content: { contains: '"status":"fail"' } },
            { content: { contains: '"status":"error"' } },
            { content: { contains: '"status": "fail"' } },
            { content: { contains: '"status": "error"' } },
            { content: { contains: '"result":false' } },
            { content: { contains: '"result": false' } }
          ]
        })
      } else {
        and.push(this.jsonFieldContains('status', String(p.status)))
      }
    }
    if (p.module) {
      and.push(this.jsonFieldContains('module', String(p.module)))
    }
    if (p.type) {
      and.push({
        OR: [
          this.jsonFieldContains('type', String(p.type)),
          { content: { contains: String(p.type) } }
        ]
      })
    }
    if (p.method) {
      and.push(this.jsonFieldContains('method', String(p.method)))
    }
    if (p.operation) {
      const op = String(p.operation).trim().toLowerCase()
      const keywords = OPERATION_KEYWORDS[op] || [String(p.operation)]
      and.push(this.contentContainsAny(keywords))
    }
    if (p.keyword) {
      const kw = String(p.keyword).trim()
      and.push({
        OR: [
          { content: { contains: kw } },
          { originalUrl: { contains: kw } },
          { hostname: { contains: kw } }
        ]
      })
    }

    if (p.loginOnly === true) {
      and.push({
        OR: [
          { content: { contains: 'login' } },
          { content: { contains: '登录' } },
          { content: { contains: 'logout' } },
          { content: { contains: '登出' } },
          { originalUrl: { contains: 'login' } },
          { originalUrl: { contains: 'Login' } }
        ]
      })
    }

    if (and.length) where.AND = and
    return where
  }

  private resolveUsername(content: Record<string, unknown>): string {
    const pick = (v: unknown) =>
      v != null && String(v).trim() !== '' ? String(v) : ''

    const direct =
      pick(content.username) ||
      pick(content.operator) ||
      pick(content.name) ||
      pick(content.userName)
    if (direct) return direct

    const userInfo = content.userInfo as Record<string, unknown> | undefined
    if (userInfo) {
      const fromUser =
        pick(userInfo.name) ||
        pick(userInfo.username) ||
        pick(userInfo.accountAlias) ||
        pick(userInfo.phone)
      if (fromUser) return fromUser
    }

    if (content.condition === 'name' || content.condition === 'phone') {
      const fromValue = pick(content.value)
      if (fromValue) return fromValue
    }

    const params = content.params as Record<string, unknown> | undefined
    const body = (params?.body || content.body) as
      | Record<string, unknown>
      | undefined
    if (body && typeof body === 'object') {
      const fromBody =
        pick(body.name) ||
        pick(body.username) ||
        pick(body.account) ||
        pick(body.phone)
      if (fromBody) return fromBody
    }

    return pick(content.uid) || ''
  }

  /** 接口路径与 query 拆分：路径列不含 ? 后参数 */
  private stripQuery(url: string | null | undefined): string {
    if (!url) return ''
    const i = String(url).indexOf('?')
    return i >= 0 ? String(url).slice(0, i) : String(url)
  }

  /** 请求接口展示：backend → 后端内部调用 */
  private formatApiPath(path: string): string {
    const p = String(path || '').trim()
    if (!p) return ''
    if (/^backend$/i.test(p)) return '后端内部调用'
    return p
  }

  /**
   * IP 展示规范化：
   * - hostname/backend 标记 → 后端模块
   * - 去掉 Node IPv4-mapped IPv6 前缀 ::ffff:
   */
  private formatIp(ip: unknown): string {
    let value = ip != null ? String(ip).trim() : ''
    if (!value) return ''
    if (/^backend$/i.test(value) || /^request$/i.test(value)) {
      return '后端模块'
    }
    // ::ffff:127.0.0.1 → 127.0.0.1（IPv6 双栈下的 IPv4 映射地址）
    if (value.toLowerCase().startsWith('::ffff:')) {
      value = value.slice(7)
    }
    return value
  }

  /** 参数列：优先 content.params，兼容历史 originalUrl 上的 query */
  private resolveParams(
    content: Record<string, unknown>,
    originalUrl: string | null | undefined
  ): string {
    if (typeof content.params === 'string' && content.params) {
      return content.params
    }
    if (content.params != null && typeof content.params === 'object') {
      return JSON.stringify(content.params)
    }
    const raw = originalUrl ? String(originalUrl) : ''
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
    return q || ''
  }

  private mapRow(row: {
    logId: bigint
    logType: string | null
    content: string | null
    hostname: string | null
    originalUrl: string | null
    createTime: bigint | null
  }) {
    const content = this.parseContent(row.content)
    const username = this.resolveUsername(content)
    const apiPath = this.formatApiPath(
      this.stripQuery(
        (content.path as string | undefined) ?? row.originalUrl ?? ''
      )
    )
    const httpMethod = normalizeHttpMethod(content.method, content.operation)
    const operation = normalizeOperationType(content, row.originalUrl)
    const ip = this.formatIp(content.ip ?? row.hostname ?? '')
    return serializeBigInt({
      id: Number(row.logId),
      logId: Number(row.logId),
      logType: row.logType,
      hostname: row.hostname,
      originalUrl: apiPath,
      create_time: this.formatTime(row.createTime),
      createTime: this.formatTime(row.createTime),
      username,
      operator: content.operator ?? username,
      operation,
      method: httpMethod || '-',
      action:
        typeof content.action === 'string'
          ? content.action
          : !httpMethod && content.method
            ? String(content.method)
            : '',
      params: this.resolveParams(content, row.originalUrl),
      ip,
      location: content.location ?? content.region ?? '',
      browser: content.browser ?? '',
      os: content.os ?? content.system ?? '',
      status:
        content.status ??
        (content.result === true || content.result === 'success'
          ? 'success'
          : content.result === false || content.result === 'fail'
            ? 'fail'
            : content.result
              ? 'fail'
              : ''),
      msg: content.msg ?? '',
      errorMsg:
        content.errorMsg ??
        (typeof content.result === 'object'
          ? JSON.stringify(content.result)
          : ''),
      module: content.module ?? '',
      type: content.type ?? row.logType ?? '',
      title: content.title ?? content.event ?? apiPath ?? '',
      content:
        typeof content.content === 'string'
          ? content.content
          : JSON.stringify(content),
      duration: content.duration ?? null,
      statusCode: content.statusCode ?? null,
      path: apiPath,
      raw: content
    })
  }

  async queryByType(logType: string, params: QueryParams) {
    const normalized = this.normalizeParams(params)
    const { curPage, pageSize, skip } = this.parsePage(normalized)
    const where = this.buildWhere(logType, normalized)

    const [total, rows] = await Promise.all([
      this.prisma.client.log.count({ where }),
      this.prisma.client.log.findMany({
        where,
        orderBy: { logId: 'desc' },
        skip,
        take: pageSize
      })
    ])

    const list = rows.map(r => this.mapRow(r))
    await this.enrichNumericUsernames(list)

    return {
      status: true,
      msg: '查询成功',
      data: {
        list,
        total,
        curPage,
        pageSize
      }
    }
  }

  /** 历史日志把 uid 写成了 username，查询时批量换成展示名 */
  private isLikelyUserId(value: unknown): boolean {
    return typeof value === 'string'
      ? /^\d+$/.test(value)
      : typeof value === 'number' && Number.isFinite(value)
  }

  private async enrichNumericUsernames(
    list: Array<Record<string, unknown>>
  ): Promise<void> {
    const ids = new Set<string>()
    for (const row of list) {
      if (this.isLikelyUserId(row.username)) ids.add(String(row.username))
      if (this.isLikelyUserId(row.operator)) ids.add(String(row.operator))
      const raw = row.raw as Record<string, unknown> | undefined
      if (raw && this.isLikelyUserId(raw.uid)) ids.add(String(raw.uid))
    }
    if (!ids.size) return

    const users = await this.prisma.client.user.findMany({
      where: {
        id: { in: [...ids].map(id => BigInt(id)) },
        deletedAt: null
      },
      select: { id: true, name: true, accountAlias: true, phone: true }
    })

    const nameMap = new Map<string, string>()
    for (const user of users) {
      const name =
        user.name?.trim() ||
        user.accountAlias?.trim() ||
        user.phone?.trim() ||
        ''
      if (name) nameMap.set(String(user.id), name)
    }
    if (!nameMap.size) return

    for (const row of list) {
      let uidHint = ''
      if (this.isLikelyUserId(row.username)) uidHint = String(row.username)
      else if (this.isLikelyUserId(row.operator)) uidHint = String(row.operator)
      else {
        const raw = row.raw as Record<string, unknown> | undefined
        if (raw && this.isLikelyUserId(raw.uid)) uidHint = String(raw.uid)
      }
      const display = uidHint ? nameMap.get(uidHint) : undefined
      if (!display) continue
      if (this.isLikelyUserId(row.username)) row.username = display
      if (this.isLikelyUserId(row.operator)) row.operator = display
    }
  }

  async queryLoginLogs(params: QueryParams) {
    // 登录相关记录落在 operate / 登录接口路径中，在 SQL 侧筛选并保留其它过滤条件
    return this.queryByType(LOG_TYPE.OPERATE, {
      ...params,
      loginOnly: true
    })
  }

  async getLogStatistics() {
    const now = new Date()
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime()
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000

    const countByType = async (logType: string, from: number, to?: number) => {
      return this.prisma.client.log.count({
        where: {
          logType,
          createTime: {
            gte: BigInt(from),
            ...(to != null ? { lt: BigInt(to) } : {})
          }
        }
      })
    }

    const countFail = async (logType: string, from: number) => {
      return this.prisma.client.log.count({
        where: {
          logType,
          createTime: { gte: BigInt(from) },
          OR: [
            { content: { contains: '"status":"fail"' } },
            { content: { contains: '"status":"error"' } }
          ]
        }
      })
    }

    const [
      todayOperate,
      yesterdayOperate,
      todayApi,
      yesterdayApi,
      todayBusiness,
      todayPerf,
      errorOperate,
      yesterdayErrorOperate,
      errorApi,
      yesterdayErrorApi
    ] = await Promise.all([
      countByType(LOG_TYPE.OPERATE, startOfToday),
      countByType(LOG_TYPE.OPERATE, startOfYesterday, startOfToday),
      countByType(LOG_TYPE.API, startOfToday),
      countByType(LOG_TYPE.API, startOfYesterday, startOfToday),
      countByType(LOG_TYPE.BUSINESS, startOfToday),
      countByType(LOG_TYPE.PERFORMANCE, startOfToday),
      countFail(LOG_TYPE.OPERATE, startOfToday),
      countFail(LOG_TYPE.OPERATE, startOfYesterday),
      countFail(LOG_TYPE.API, startOfToday),
      countFail(LOG_TYPE.API, startOfYesterday)
    ])

    const trend = (today: number, yesterday: number) => {
      if (!yesterday) return today > 0 ? 100 : 0
      return Math.round(((today - yesterday) / yesterday) * 100)
    }

    // 近 7 日操作趋势
    const dates: string[] = []
    const success: number[] = []
    const fail: number[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfToday - i * 24 * 60 * 60 * 1000
      const dayEnd = dayStart + 24 * 60 * 60 * 1000
      const d = new Date(dayStart)
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
      const [ok, bad] = await Promise.all([
        this.prisma.client.log.count({
          where: {
            logType: LOG_TYPE.OPERATE,
            createTime: { gte: BigInt(dayStart), lt: BigInt(dayEnd) },
            NOT: {
              OR: [
                { content: { contains: '"status":"fail"' } },
                { content: { contains: '"status":"error"' } }
              ]
            }
          }
        }),
        this.prisma.client.log.count({
          where: {
            logType: LOG_TYPE.OPERATE,
            createTime: { gte: BigInt(dayStart), lt: BigInt(dayEnd) },
            OR: [
              { content: { contains: '"status":"fail"' } },
              { content: { contains: '"status":"error"' } }
            ]
          }
        })
      ])
      success.push(ok)
      fail.push(bad)
    }

    const recentOperate = await this.prisma.client.log.findMany({
      where: {
        logType: LOG_TYPE.OPERATE,
        createTime: { gte: BigInt(startOfToday - 6 * 86400000) }
      },
      select: { content: true },
      take: 500
    })

    const opCounter = { insert: 0, update: 0, delete: 0, select: 0 }
    for (const row of recentOperate) {
      const text = (row.content || '').toLowerCase()
      if (
        text.includes('insert') ||
        text.includes('create') ||
        text.includes('register') ||
        text.includes('新增')
      ) {
        opCounter.insert++
      } else if (
        text.includes('update') ||
        text.includes('modify') ||
        text.includes('修改')
      ) {
        opCounter.update++
      } else if (
        text.includes('delete') ||
        text.includes('cancel') ||
        text.includes('删除')
      ) {
        opCounter.delete++
      } else {
        opCounter.select++
      }
    }

    return {
      status: true,
      msg: 'ok',
      data: {
        todayLogin: todayOperate,
        todayOperation: todayOperate,
        todayApi,
        todayBusiness,
        todayPerformance: todayPerf,
        errorLogin: errorOperate,
        errorOperation: errorOperate + errorApi,
        loginTrend: trend(todayOperate, yesterdayOperate),
        operationTrend: trend(todayOperate, yesterdayOperate),
        apiTrend: trend(todayApi, yesterdayApi),
        errorLoginTrend: trend(errorOperate, yesterdayErrorOperate),
        errorOperationTrend: trend(
          errorOperate + errorApi,
          yesterdayErrorOperate + yesterdayErrorApi
        ),
        charts: {
          loginChart: { dates, success, fail },
          operationChart: opCounter
        }
      }
    }
  }

  async deleteLog(id: number | string) {
    await this.prisma.client.log.delete({ where: { logId: BigInt(id) } })
    return { status: true, msg: '删除成功', data: null }
  }

  async batchDeleteLogs(ids: Array<number | string> | string) {
    const list = Array.isArray(ids)
      ? ids
      : String(ids)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
    if (!list.length) {
      return { status: false, msg: '请选择要删除的日志', data: null }
    }
    await this.prisma.client.log.deleteMany({
      where: { logId: { in: list.map(id => BigInt(id)) } }
    })
    return { status: true, msg: '删除成功', data: { count: list.length } }
  }

  /** 前端埋点上报 */
  track(payload: {
    type?: string
    event?: string
    path?: string
    title?: string
    module?: string
    username?: string
    extra?: Record<string, unknown>
    hostname?: string
  }) {
    const type = payload.type || LOG_TYPE.BUSINESS
    const logType =
      type === 'pageview' || type === 'click' || type === 'event'
        ? LOG_TYPE.BUSINESS
        : Object.values(LOG_TYPE).includes(
              type as (typeof LOG_TYPE)[keyof typeof LOG_TYPE]
            )
          ? type
          : LOG_TYPE.BUSINESS

    Log.addLog(logType, payload.hostname || 'frontend', payload.path || '', {
      type: payload.type || 'event',
      event: payload.event || '',
      title: payload.title || payload.event || 'track',
      module: payload.module || 'frontend',
      username: payload.username || '',
      operator: payload.username || '',
      path: payload.path || '',
      status: 'success',
      msg: payload.event || 'track',
      ...(payload.extra || {})
    })

    return { status: true, msg: 'ok', data: null }
  }

  /** 手动写入业务/操作日志（供其它模块调用） */
  writeLog(
    logType: string,
    hostname: string,
    originalUrl: string,
    content: Record<string, unknown>
  ) {
    Log.addLog(logType, hostname, originalUrl, content)
  }
}
