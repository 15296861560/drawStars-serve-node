import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const ALERT_RULE_TYPES = [
  'ERROR_COUNT',
  'TIMEOUT_COUNT',
  'ERROR_RATE',
  'QUEUE_BACKLOG'
]

const FAILED_STATUSES = ['FAILED', 'TIMEOUT']

type TrendRow = {
  createdAt: Date
  status: string
  durationMs?: number | null
}

@Injectable()
export class WorkflowStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 统计：概览 ====================

  /** 执行概览 Dashboard（PRD 4.7.1） */
  async overview() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      todayTotal,
      todaySucceeded,
      todayFailed,
      todayAvg,
      activeWorkflowRows,
      backlog,
      workflowStatusGroups,
      triggerGroups
    ] = await Promise.all([
      this.prisma.client.workflowExecution.count({
        where: { createdAt: { gte: todayStart } }
      }),
      this.prisma.client.workflowExecution.count({
        where: { createdAt: { gte: todayStart }, status: 'SUCCEEDED' }
      }),
      this.prisma.client.workflowExecution.count({
        where: { createdAt: { gte: todayStart }, status: { in: FAILED_STATUSES } }
      }),
      this.prisma.client.workflowExecution.aggregate({
        where: {
          createdAt: { gte: todayStart },
          status: 'SUCCEEDED',
          durationMs: { not: null }
        },
        _avg: { durationMs: true }
      }),
      this.prisma.client.workflowExecution.groupBy({
        by: ['workflowId'],
        where: { createdAt: { gte: todayStart } },
        _count: { _all: true }
      }),
      this.prisma.client.workflowExecution.count({
        where: { status: 'PENDING' }
      }),
      this.prisma.client.workflow.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true }
      }),
      this.prisma.client.workflowExecution.groupBy({
        by: ['triggerType'],
        _count: { _all: true }
      })
    ])

    return {
      todayTotal,
      todaySucceeded,
      todayFailed,
      successRate:
        todayTotal > 0
          ? Number(((todaySucceeded / todayTotal) * 100).toFixed(2))
          : 0,
      avgDurationMs: Math.round(todayAvg._avg.durationMs ?? 0),
      activeWorkflowCount: activeWorkflowRows.length,
      backlog,
      workflowStatus: workflowStatusGroups.map(g => ({
        status: g.status,
        count: g._count._all
      })),
      triggerTypeDistribution: triggerGroups.map(g => ({
        triggerType: g.triggerType,
        count: g._count._all
      }))
    }
  }

  // ==================== 统计：趋势 ====================

  /** 执行趋势（按日聚合：执行量 / 成功 / 失败 / 成功率 / 平均耗时） */
  async trend(params: { days?: number }) {
    const days = Math.min(90, Math.max(1, Math.floor(Number(params.days) || 7)))
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (days - 1))

    const rows = await this.prisma.client.workflowExecution.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, status: true, durationMs: true }
    })
    return { days, list: this.buildDailyTrend(rows, start, days) }
  }

  // ==================== 统计：单流程分析 ====================

  /** 流程维度分析（PRD 4.7.2）：总次数/成功率/平均耗时/节点错误率/触发来源/每日趋势 */
  async workflowStatistics(
    id: string | number,
    params: { days?: number }
  ) {
    const wid = this.parseId(id)
    const workflow = await this.prisma.client.workflow.findFirst({
      where: { id: wid, deletedAt: null },
      select: { id: true, workflowNo: true, name: true, status: true }
    })
    if (!workflow) throw new NotFoundException('流程不存在')

    const days = Math.min(90, Math.max(1, Math.floor(Number(params.days) || 7)))
    const trendStart = new Date()
    trendStart.setHours(0, 0, 0, 0)
    trendStart.setDate(trendStart.getDate() - (days - 1))

    const [
      total,
      succeeded,
      avg,
      triggerGroups,
      trendRows,
      executionIds
    ] = await Promise.all([
      this.prisma.client.workflowExecution.count({ where: { workflowId: wid } }),
      this.prisma.client.workflowExecution.count({
        where: { workflowId: wid, status: 'SUCCEEDED' }
      }),
      this.prisma.client.workflowExecution.aggregate({
        where: { workflowId: wid, status: 'SUCCEEDED', durationMs: { not: null } },
        _avg: { durationMs: true }
      }),
      this.prisma.client.workflowExecution.groupBy({
        by: ['triggerType'],
        where: { workflowId: wid },
        _count: { _all: true }
      }),
      this.prisma.client.workflowExecution.findMany({
        where: { workflowId: wid, createdAt: { gte: trendStart } },
        select: { createdAt: true, status: true, durationMs: true }
      }),
      this.prisma.client.workflowExecution.findMany({
        where: { workflowId: wid },
        select: { id: true }
      })
    ])

    // 节点维度错误率排名（PRD 4.7.3）
    const ids = executionIds.map(e => e.id)
    type NodeGroup = {
      nodeId: string
      nodeName: string | null
      _count: { _all: number }
    }
    let stepTotals: NodeGroup[] = []
    let stepFailed: NodeGroup[] = []
    if (ids.length) {
      const [totals, failed] = await Promise.all([
        this.prisma.client.executionStepLog.groupBy({
          by: ['nodeId', 'nodeName'],
          where: { executionId: { in: ids } },
          _count: { _all: true }
        }),
        this.prisma.client.executionStepLog.groupBy({
          by: ['nodeId', 'nodeName'],
          where: { executionId: { in: ids }, status: 'FAILED' },
          _count: { _all: true }
        })
      ])
      stepTotals = totals
      stepFailed = failed
    }
    const nodeStats = new Map<
      string,
      { nodeId: string; nodeName: string; total: number; failed: number }
    >()
    for (const g of stepTotals) {
      nodeStats.set(g.nodeId, {
        nodeId: g.nodeId,
        nodeName: g.nodeName ?? g.nodeId,
        total: g._count._all,
        failed: 0
      })
    }
    for (const g of stepFailed) {
      const item = nodeStats.get(g.nodeId)
      if (item) item.failed = g._count._all
    }

    return {
      workflow: {
        id: Number(workflow.id),
        workflowNo: workflow.workflowNo,
        name: workflow.name,
        status: workflow.status
      },
      totalExecutions: total,
      succeeded,
      successRate:
        total > 0 ? Number(((succeeded / total) * 100).toFixed(2)) : 0,
      avgDurationMs: Math.round(avg._avg.durationMs ?? 0),
      triggerSource: triggerGroups.map(g => ({
        triggerType: g.triggerType,
        count: g._count._all
      })),
      nodeErrorRanking: Array.from(nodeStats.values())
        .map(s => ({
          nodeId: s.nodeId,
          nodeName: s.nodeName,
          executions: s.total,
          failed: s.failed,
          errorRate:
            s.total > 0 ? Number(((s.failed / s.total) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => b.errorRate - a.errorRate || b.executions - a.executions)
        .slice(0, 10),
      dailyTrend: this.buildDailyTrend(trendRows, trendStart, days)
    }
  }

  // ==================== 统计：数据导出 ====================

  /** 执行历史导出：按筛选条件生成 CSV（前端 Blob 下载） */
  async exportExecutions(body: Record<string, unknown>) {
    const start = this.parseDate(body.startTime, '开始')
    const end = this.parseDate(body.endTime, '结束')
    const workflowId =
      body.workflowId != null && body.workflowId !== ''
        ? this.parseId(body.workflowId)
        : null
    const where: Prisma.WorkflowExecutionWhereInput = {
      ...(workflowId ? { workflowId } : {}),
      ...(body.status != null && body.status !== ''
        ? { status: String(body.status) }
        : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {})
            }
          }
        : {})
    }
    const rows = await this.prisma.client.workflowExecution.findMany({
      where,
      include: {
        workflow: { select: { name: true, workflowNo: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10000
    })

    const header = [
      '执行编号',
      '流程名称',
      '流程编号',
      '版本',
      '状态',
      '触发方式',
      '耗时(ms)',
      '开始时间',
      '结束时间',
      '错误信息'
    ]
    const lines = [header.map(h => this.csvCell(h)).join(',')]
    for (const r of rows) {
      lines.push(
        [
          r.executionNo,
          r.workflow?.name ?? '',
          r.workflow?.workflowNo ?? '',
          r.workflowVersion,
          r.status,
          r.triggerType,
          r.durationMs ?? '',
          this.toIso(r.startedAt) ?? '',
          this.toIso(r.finishedAt) ?? '',
          r.errorMessage ?? ''
        ]
          .map(c => this.csvCell(c))
          .join(',')
      )
    }
    const now = new Date()
    const stamp = `${this.formatDayKey(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    return {
      fileName: `workflow-executions-${stamp}.csv`,
      total: rows.length,
      csv: `\uFEFF${lines.join('\r\n')}`
    }
  }

  // ==================== 告警规则管理 ====================

  async listAlerts(params: {
    page?: number
    pageSize?: number
    workflowId?: string | number
    enabled?: string
  }) {
    const { skip, take } = this.parsePagination(params)
    const where: Prisma.WorkflowAlertRuleWhereInput = {
      ...(params.workflowId
        ? { workflowId: this.parseId(params.workflowId) }
        : {}),
      ...(params.enabled === 'true' || params.enabled === 'false'
        ? { enabled: params.enabled === 'true' }
        : {})
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.workflowAlertRule.count({ where }),
      this.prisma.client.workflowAlertRule.findMany({
        where,
        include: {
          workflow: { select: { id: true, name: true, workflowNo: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])
    return { list: rows.map(r => this.mapAlertRule(r)), total }
  }

  async createAlert(body: Record<string, unknown>) {
    const ruleType = String(body.ruleType || '').toUpperCase()
    if (!ALERT_RULE_TYPES.includes(ruleType)) {
      throw new BadRequestException(
        `非法告警规则类型（允许: ${ALERT_RULE_TYPES.join('/')})`
      )
    }
    const threshold = Number(body.threshold)
    if (!Number.isInteger(threshold) || threshold < 0) {
      throw new BadRequestException('告警阈值必须为非负整数')
    }
    const windowMinutes = Number(body.windowMinutes ?? 5)
    if (!Number.isInteger(windowMinutes) || windowMinutes < 1) {
      throw new BadRequestException('统计窗口必须为正整数分钟')
    }
    if (!Array.isArray(body.notifyChannels) || body.notifyChannels.length === 0) {
      throw new BadRequestException('通知渠道（notifyChannels）必填且为数组')
    }
    let workflowId: bigint | null = null
    if (body.workflowId != null && body.workflowId !== '') {
      workflowId = this.parseId(body.workflowId)
      const wf = await this.prisma.client.workflow.findFirst({
        where: { id: workflowId, deletedAt: null },
        select: { id: true }
      })
      if (!wf) throw new BadRequestException('关联流程不存在')
    }
    const row = await this.prisma.client.workflowAlertRule.create({
      data: {
        workflowId,
        ruleType,
        threshold,
        windowMinutes,
        notifyChannels: body.notifyChannels as Prisma.InputJsonValue,
        notifyUsers:
          body.notifyUsers != null && Array.isArray(body.notifyUsers)
            ? (body.notifyUsers as Prisma.InputJsonValue)
            : Prisma.DbNull,
        enabled:
          body.enabled == null ? true : body.enabled === true || body.enabled === 'true'
      },
      include: {
        workflow: { select: { id: true, name: true, workflowNo: true } }
      }
    })
    return this.mapAlertRule(row)
  }

  async updateAlert(id: string | number, body: Record<string, unknown>) {
    const rule = await this.getAlertRow(id)
    const data: Prisma.WorkflowAlertRuleUpdateInput = {}
    if (body.ruleType != null) {
      const ruleType = String(body.ruleType).toUpperCase()
      if (!ALERT_RULE_TYPES.includes(ruleType)) {
        throw new BadRequestException(
          `非法告警规则类型（允许: ${ALERT_RULE_TYPES.join('/')})`
        )
      }
      data.ruleType = ruleType
    }
    if (body.threshold != null) {
      const threshold = Number(body.threshold)
      if (!Number.isInteger(threshold) || threshold < 0) {
        throw new BadRequestException('告警阈值必须为非负整数')
      }
      data.threshold = threshold
    }
    if (body.windowMinutes != null) {
      const windowMinutes = Number(body.windowMinutes)
      if (!Number.isInteger(windowMinutes) || windowMinutes < 1) {
        throw new BadRequestException('统计窗口必须为正整数分钟')
      }
      data.windowMinutes = windowMinutes
    }
    if (body.notifyChannels != null) {
      if (!Array.isArray(body.notifyChannels) || body.notifyChannels.length === 0) {
        throw new BadRequestException('通知渠道（notifyChannels）必填且为数组')
      }
      data.notifyChannels = body.notifyChannels as Prisma.InputJsonValue
    }
    if (body.notifyUsers !== undefined) {
      data.notifyUsers =
        body.notifyUsers != null && Array.isArray(body.notifyUsers)
          ? (body.notifyUsers as Prisma.InputJsonValue)
          : Prisma.DbNull
    }
    if (body.enabled !== undefined) {
      data.enabled = body.enabled === true || body.enabled === 'true'
    }
    if (body.workflowId !== undefined) {
      if (body.workflowId == null || body.workflowId === '') {
        data.workflow = { disconnect: true }
      } else {
        const wid = this.parseId(body.workflowId)
        const wf = await this.prisma.client.workflow.findFirst({
          where: { id: wid, deletedAt: null },
          select: { id: true }
        })
        if (!wf) throw new BadRequestException('关联流程不存在')
        data.workflow = { connect: { id: wid } }
      }
    }
    const updated = await this.prisma.client.workflowAlertRule.update({
      where: { id: rule.id },
      data,
      include: {
        workflow: { select: { id: true, name: true, workflowNo: true } }
      }
    })
    return this.mapAlertRule(updated)
  }

  async deleteAlert(id: string | number) {
    const rule = await this.getAlertRow(id)
    await this.prisma.client.workflowAlertRule.delete({
      where: { id: rule.id }
    })
    return true
  }

  // ==================== 分类管理 ====================

  /** 分类列表（小表全量，供下拉与管理页共用） */
  async listCategories(params: { enabled?: string; keyword?: string }) {
    const where: Prisma.WorkflowCategoryWhereInput = {
      ...(params.enabled === 'true' || params.enabled === 'false'
        ? { enabled: params.enabled === 'true' }
        : {}),
      ...(params.keyword
        ? {
            OR: [
              { name: { contains: params.keyword } },
              { code: { contains: params.keyword } }
            ]
          }
        : {})
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.workflowCategory.count({ where }),
      this.prisma.client.workflowCategory.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
      })
    ])
    return { list: rows.map(r => this.mapCategory(r)), total }
  }

  async createCategory(body: Record<string, unknown>) {
    const name = String(body.name || '').trim()
    if (!name || name.length > 64) {
      throw new BadRequestException('分类名称必填且不超过 64 字符')
    }
    const code = String(body.code || '').trim()
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
      throw new BadRequestException(
        '分类编码仅允许字母/数字/下划线/中划线，长度 1-32'
      )
    }
    const sortOrder = Number(body.sortOrder ?? 0)
    if (!Number.isInteger(sortOrder)) {
      throw new BadRequestException('排序值必须为整数')
    }
    try {
      const row = await this.prisma.client.workflowCategory.create({
        data: {
          name,
          code,
          icon: body.icon != null ? String(body.icon).slice(0, 128) : null,
          description:
            body.description != null
              ? String(body.description).slice(0, 255)
              : null,
          sortOrder,
          enabled:
            body.enabled == null
              ? true
              : body.enabled === true || body.enabled === 'true'
        }
      })
      return this.mapCategory(row)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('分类编码已存在')
      }
      throw e
    }
  }

  async updateCategory(id: string | number, body: Record<string, unknown>) {
    const cid = this.parseId(id)
    const row = await this.prisma.client.workflowCategory.findUnique({
      where: { id: cid }
    })
    if (!row) throw new NotFoundException('分类不存在')
    const data: Prisma.WorkflowCategoryUpdateInput = {}
    if (body.name != null) {
      const name = String(body.name).trim()
      if (!name || name.length > 64) {
        throw new BadRequestException('分类名称必填且不超过 64 字符')
      }
      data.name = name
    }
    if (body.code != null) {
      const code = String(body.code).trim()
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
        throw new BadRequestException(
          '分类编码仅允许字母/数字/下划线/中划线，长度 1-32'
        )
      }
      data.code = code
    }
    if (body.icon !== undefined) {
      data.icon = body.icon == null ? null : String(body.icon).slice(0, 128)
    }
    if (body.description !== undefined) {
      data.description =
        body.description == null
          ? null
          : String(body.description).slice(0, 255)
    }
    if (body.sortOrder != null) {
      const sortOrder = Number(body.sortOrder)
      if (!Number.isInteger(sortOrder)) {
        throw new BadRequestException('排序值必须为整数')
      }
      data.sortOrder = sortOrder
    }
    if (body.enabled !== undefined) {
      data.enabled = body.enabled === true || body.enabled === 'true'
    }
    try {
      const updated = await this.prisma.client.workflowCategory.update({
        where: { id: cid },
        data
      })
      return this.mapCategory(updated)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('分类编码已存在')
      }
      throw e
    }
  }

  async deleteCategory(id: string | number) {
    const cid = this.parseId(id)
    const row = await this.prisma.client.workflowCategory.findUnique({
      where: { id: cid }
    })
    if (!row) throw new NotFoundException('分类不存在')
    const refCount = await this.prisma.client.workflow.count({
      where: { categoryId: cid }
    })
    if (refCount > 0) {
      throw new BadRequestException(
        `该分类下仍有 ${refCount} 个流程，无法删除（请先迁移流程）`
      )
    }
    await this.prisma.client.workflowCategory.delete({ where: { id: cid } })
    return true
  }

  // ==================== 私有工具方法 ====================

  private parseId(id: unknown): bigint {
    const n = Number(id)
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('非法 ID 参数')
    }
    return BigInt(n)
  }

  private parsePagination(params: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1))
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(Number(params.pageSize) || 10))
    )
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
  }

  private toIso(d?: Date | null) {
    return d ? d.toISOString() : null
  }

  private formatDayKey(d = new Date()): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  private parseDate(value: unknown, label: string): Date | undefined {
    if (value == null || value === '') return undefined
    const d = new Date(String(value))
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`非法${label}时间格式`)
    }
    return d
  }

  private async getAlertRow(id: string | number) {
    const aid = this.parseId(id)
    const row = await this.prisma.client.workflowAlertRule.findUnique({
      where: { id: aid }
    })
    if (!row) throw new NotFoundException('告警规则不存在')
    return row
  }

  /** 按日聚合趋势（内存分组，补齐空白天） */
  private buildDailyTrend(rows: TrendRow[], start: Date, days: number) {
    const buckets = new Map<
      string,
      { total: number; succeeded: number; failed: number; durationSum: number; durationCount: number }
    >()
    for (const r of rows) {
      const key = this.formatDayKey(r.createdAt)
      let b = buckets.get(key)
      if (!b) {
        b = { total: 0, succeeded: 0, failed: 0, durationSum: 0, durationCount: 0 }
        buckets.set(key, b)
      }
      b.total++
      if (r.status === 'SUCCEEDED') {
        b.succeeded++
        if (r.durationMs != null) {
          b.durationSum += r.durationMs
          b.durationCount++
        }
      }
      if (FAILED_STATUSES.includes(r.status)) b.failed++
    }
    const list: {
      date: string
      total: number
      succeeded: number
      failed: number
      successRate: number
      avgDurationMs: number
    }[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = this.formatDayKey(d)
      const b = buckets.get(key)
      list.push({
        date: key,
        total: b?.total ?? 0,
        succeeded: b?.succeeded ?? 0,
        failed: b?.failed ?? 0,
        successRate:
          b && b.total > 0
            ? Number(((b.succeeded / b.total) * 100).toFixed(2))
            : 0,
        avgDurationMs:
          b && b.durationCount > 0
            ? Math.round(b.durationSum / b.durationCount)
            : 0
      })
    }
    return list
  }

  /** CSV 单元格转义（含逗号/引号/换行时加引号包裹） */
  private csvCell(value: unknown): string {
    const s = value == null ? '' : String(value)
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  // ==================== 序列化 ====================

  private mapAlertRule(row: {
    id: bigint
    workflowId?: bigint | null
    ruleType: string
    threshold: number
    windowMinutes: number
    notifyChannels: Prisma.JsonValue
    notifyUsers?: Prisma.JsonValue | null
    enabled: boolean
    createdAt: Date
    updatedAt: Date
    workflow?: { id: bigint; name: string; workflowNo: string } | null
  }) {
    return {
      id: Number(row.id),
      workflowId: row.workflowId != null ? Number(row.workflowId) : null,
      workflow: row.workflow
        ? {
            id: Number(row.workflow.id),
            name: row.workflow.name,
            workflowNo: row.workflow.workflowNo
          }
        : null,
      ruleType: row.ruleType,
      threshold: row.threshold,
      windowMinutes: row.windowMinutes,
      notifyChannels: row.notifyChannels ?? null,
      notifyUsers: row.notifyUsers ?? null,
      enabled: row.enabled,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }

  private mapCategory(row: {
    id: bigint
    name: string
    code: string
    icon?: string | null
    description?: string | null
    sortOrder: number
    enabled: boolean
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      code: row.code,
      icon: row.icon ?? null,
      description: row.description ?? null,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }
}
