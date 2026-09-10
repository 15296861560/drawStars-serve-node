import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

type AuthInfo = { uid?: string | number }

/** graph_data 画布结构（PRD 5.3 约定） */
type GraphNode = {
  id: string
  type: string | null
  name: string | null
  config: Record<string, unknown> | null
}

type ParsedGraph = {
  nodes: GraphNode[]
  edges: { source: string; target: string }[]
}

const WORKFLOW_STATUSES = [
  'DRAFT',
  'PENDING',
  'PUBLISHED',
  'REJECTED',
  'PAUSED',
  'OFFLINE'
]

const EMPTY_GRAPH = { nodes: [], edges: [] }

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 参数工具 ====================

  resolveUid(auth?: AuthInfo): bigint {
    if (auth?.uid != null && auth.uid !== '') {
      const n = Number(auth.uid)
      if (Number.isFinite(n) && n > 0) return BigInt(n)
    }
    throw new BadRequestException('缺少用户身份')
  }

  private parseId(id: unknown): bigint {
    const n = Number(id)
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('非法 ID 参数')
    }
    return BigInt(n)
  }

  /** 可空 Json 字段写入（Prisma 6 不接受 null 字面量，数据库 NULL 用 DbNull） */
  private jsonInput(v: unknown) {
    return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue)
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
    return `${y}${m}${day}`
  }

  private parseDate(value: unknown, label: string): Date | undefined {
    if (value == null || value === '') return undefined
    const d = new Date(String(value))
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`非法${label}时间格式`)
    }
    return d
  }

  /** 容错解析 graph_data JSON（PRD 5.3：{ nodes, edges }） */
  private parseGraph(raw: unknown): ParsedGraph {
    const graph: ParsedGraph = { nodes: [], edges: [] }
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return graph
    }
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.nodes)) {
      graph.nodes = obj.nodes
        .map(n => {
          if (n == null || typeof n !== 'object') return null
          const node = n as Record<string, unknown>
          if (typeof node.id !== 'string' || !node.id) return null
          return {
            id: node.id,
            type: typeof node.type === 'string' ? node.type : null,
            name: typeof node.name === 'string' ? node.name : null,
            config:
              node.config != null && typeof node.config === 'object'
                ? (node.config as Record<string, unknown>)
                : null
          }
        })
        .filter((n): n is GraphNode => n !== null)
    }
    if (Array.isArray(obj.edges)) {
      graph.edges = obj.edges
        .map(e => {
          if (e == null || typeof e !== 'object') return null
          const edge = e as Record<string, unknown>
          if (
            typeof edge.source !== 'string' ||
            typeof edge.target !== 'string'
          ) {
            return null
          }
          return { source: edge.source, target: edge.target }
        })
        .filter((e): e is { source: string; target: string } => e !== null)
    }
    return graph
  }

  /** 从 TRIGGER 节点提取触发方式（列表展示用） */
  private extractTriggerType(graph: unknown): string {
    const parsed = this.parseGraph(graph)
    const trigger = parsed.nodes.find(
      n => String(n.type || '').toUpperCase() === 'TRIGGER'
    )
    const t = String(
      (trigger?.config as Record<string, unknown> | null)?.triggerType || ''
    ).toUpperCase()
    return t || 'MANUAL'
  }

  /**
   * 流程编号：WF + 日期(YYYYMMDD) + 3 位当日序号
   * 唯一索引 + 冲突重试，兼容并发创建
   * （public：组件市场安装模板时复用）
   */
  async allocateWorkflowNo(): Promise<string> {
    const prefix = `WF${this.formatDayKey()}`
    for (let attempt = 0; attempt < 8; attempt++) {
      const latest = await this.prisma.client.workflow.findFirst({
        where: { workflowNo: { startsWith: prefix } },
        orderBy: { workflowNo: 'desc' },
        select: { workflowNo: true }
      })
      let next = 1
      if (latest?.workflowNo?.startsWith(prefix)) {
        const n = Number(latest.workflowNo.slice(prefix.length))
        if (Number.isFinite(n) && n >= 0) next = n + 1
      }
      next += attempt
      if (next > 999) break
      const workflowNo = `${prefix}${String(next).padStart(3, '0')}`
      const exists = await this.prisma.client.workflow.findUnique({
        where: { workflowNo },
        select: { id: true }
      })
      if (!exists) return workflowNo
    }
    // 同日序号溢出兜底：追加时间戳片段
    return `${prefix}${Date.now().toString().slice(-6)}`
  }

  /**
   * 执行编号：EX + 日期(YYYYMMDD) + 3 位当日序号
   */
  private async allocateExecutionNo(): Promise<string> {
    const prefix = `EX${this.formatDayKey()}`
    for (let attempt = 0; attempt < 8; attempt++) {
      const latest = await this.prisma.client.workflowExecution.findFirst({
        where: { executionNo: { startsWith: prefix } },
        orderBy: { executionNo: 'desc' },
        select: { executionNo: true }
      })
      let next = 1
      if (latest?.executionNo?.startsWith(prefix)) {
        const n = Number(latest.executionNo.slice(prefix.length))
        if (Number.isFinite(n) && n >= 0) next = n + 1
      }
      next += attempt
      if (next > 999) break
      const executionNo = `${prefix}${String(next).padStart(3, '0')}`
      const exists = await this.prisma.client.workflowExecution.findUnique({
        where: { executionNo },
        select: { id: true }
      })
      if (!exists) return executionNo
    }
    return `${prefix}${Date.now().toString().slice(-6)}`
  }

  private async writeAudit(
    workflowId: bigint | null,
    userId: bigint,
    action: string,
    detail?: Record<string, unknown>
  ) {
    await this.prisma.client.workflowAuditLog.create({
      data: {
        workflowId,
        userId,
        action,
        detail: (detail ?? {}) as Prisma.InputJsonValue
      }
    })
  }

  private async getWorkflowRow(
    id: string | number,
    opts?: { includeDeleted?: boolean }
  ) {
    const wid = this.parseId(id)
    const row = await this.prisma.client.workflow.findFirst({
      where: {
        id: wid,
        ...(opts?.includeDeleted ? {} : { deletedAt: null })
      },
      include: { category: true }
    })
    if (!row) throw new NotFoundException('流程不存在')
    return row
  }

  private assertStatus(
    current: string,
    allowed: string[],
    action: string
  ): void {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `当前状态 ${current} 不允许${action}（允许状态: ${allowed.join('/')})`
      )
    }
  }

  // ==================== 流程管理 ====================

  async listWorkflows(params: {
    page?: number
    pageSize?: number
    keyword?: string
    categoryId?: string | number
    status?: string
    deleted?: string
  }) {
    const { skip, take } = this.parsePagination(params)
    if (params.status && !WORKFLOW_STATUSES.includes(params.status)) {
      throw new BadRequestException('非法流程状态筛选值')
    }
    const where: Prisma.WorkflowWhereInput = {
      deletedAt:
        params.deleted === '1' || params.deleted === 'true'
          ? { not: null }
          : null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.categoryId
        ? { categoryId: this.parseId(params.categoryId) }
        : {}),
      ...(params.keyword
        ? {
            OR: [
              { name: { contains: params.keyword } },
              { workflowNo: { contains: params.keyword } }
            ]
          }
        : {})
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.workflow.count({ where }),
      this.prisma.client.workflow.findMany({
        where,
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
        skip,
        take
      })
    ])

    // 批量补充执行次数 / 最近执行时间
    const ids = rows.map(r => r.id)
    const grouped = ids.length
      ? await this.prisma.client.workflowExecution.groupBy({
          by: ['workflowId'],
          where: { workflowId: { in: ids } },
          _count: { _all: true },
          _max: { createdAt: true }
        })
      : []
    const statsMap = new Map(
      grouped.map(g => [
        g.workflowId,
        { count: g._count._all, lastAt: g._max.createdAt }
      ])
    )

    return {
      list: rows.map(row =>
        this.mapWorkflow(row, {
          withGraph: false,
          executionCount: statsMap.get(row.id)?.count ?? 0,
          lastExecutedAt: statsMap.get(row.id)?.lastAt ?? null
        })
      ),
      total
    }
  }

  async getWorkflow(id: string | number) {
    const row = await this.getWorkflowRow(id, { includeDeleted: true })
    return this.mapWorkflow(row, { withGraph: true })
  }

  async createWorkflow(
    body: Record<string, unknown>,
    auth?: AuthInfo
  ): Promise<Record<string, unknown>> {
    const uid = this.resolveUid(auth)
    const name = String(body.name || '').trim()
    if (!name || name.length > 128) {
      throw new BadRequestException('流程名称必填且不超过 128 字符')
    }
    if (body.categoryId == null) {
      throw new BadRequestException('所属分类必填')
    }
    const categoryId = this.parseId(body.categoryId)
    const category = await this.prisma.client.workflowCategory.findUnique({
      where: { id: categoryId }
    })
    if (!category) throw new BadRequestException('所属分类不存在')

    const graphData =
      body.graphData != null && typeof body.graphData === 'object'
        ? body.graphData
        : EMPTY_GRAPH

    try {
      const workflowNo = await this.allocateWorkflowNo()
      const row = await this.prisma.client.workflow.create({
        data: {
          workflowNo,
          name,
          description:
            body.description != null ? String(body.description) : null,
          icon: body.icon != null ? String(body.icon) : null,
          categoryId,
          tags: Array.isArray(body.tags)
            ? (body.tags as Prisma.InputJsonValue)
            : Prisma.DbNull,
          status: 'DRAFT',
          currentVersion: 1,
          graphData: graphData as Prisma.InputJsonValue,
          globalConfig:
            body.globalConfig != null && typeof body.globalConfig === 'object'
              ? (body.globalConfig as Prisma.InputJsonValue)
              : Prisma.DbNull,
          creatorId: uid
        }
      })
      // 创建时生成 v1 版本快照
      await this.prisma.client.workflowVersion.create({
        data: {
          workflowId: row.id,
          version: 1,
          graphData: graphData as Prisma.InputJsonValue,
          globalConfig:
            body.globalConfig != null && typeof body.globalConfig === 'object'
              ? (body.globalConfig as Prisma.InputJsonValue)
              : Prisma.DbNull,
          changeNote: '初始版本',
          createdBy: uid
        }
      })
      await this.writeAudit(row.id, uid, 'CREATE', { name })
      return this.mapWorkflow(
        { ...row, category },
        { withGraph: true }
      )
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('流程编号冲突，请重试')
      }
      throw e
    }
  }

  async updateWorkflow(
    id: string | number,
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['DRAFT', 'REJECTED'], '编辑流程')

    const data: Prisma.WorkflowUpdateInput = {}
    if (body.name != null) {
      const name = String(body.name).trim()
      if (!name || name.length > 128) {
        throw new BadRequestException('流程名称必填且不超过 128 字符')
      }
      data.name = name
    }
    if (body.description !== undefined) {
      data.description =
        body.description == null ? null : String(body.description)
    }
    if (body.icon !== undefined) {
      data.icon = body.icon == null ? null : String(body.icon)
    }
    if (body.categoryId != null) {
      const categoryId = this.parseId(body.categoryId)
      const category = await this.prisma.client.workflowCategory.findUnique({
        where: { id: categoryId }
      })
      if (!category) throw new BadRequestException('所属分类不存在')
      data.category = { connect: { id: categoryId } }
    }
    if (body.tags !== undefined) {
      data.tags = Array.isArray(body.tags)
        ? (body.tags as Prisma.InputJsonValue)
        : Prisma.DbNull
    }
    if (body.graphData != null) {
      if (typeof body.graphData !== 'object') {
        throw new BadRequestException('graphData 必须为对象')
      }
      data.graphData = body.graphData as Prisma.InputJsonValue
    }
    if (body.globalConfig !== undefined) {
      data.globalConfig =
        body.globalConfig != null && typeof body.globalConfig === 'object'
          ? (body.globalConfig as Prisma.InputJsonValue)
          : Prisma.DbNull
    }

    const nextVersion = row.currentVersion + 1
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { ...data, currentVersion: nextVersion },
      include: { category: true }
    })
    // 每次保存生成新版本快照
    await this.prisma.client.workflowVersion.create({
      data: {
        workflowId: row.id,
        version: nextVersion,
        graphData: (updated.graphData ?? EMPTY_GRAPH) as Prisma.InputJsonValue,
        globalConfig:
          updated.globalConfig != null
            ? (updated.globalConfig as Prisma.InputJsonValue)
            : Prisma.DbNull,
        changeNote:
          body.changeNote != null
            ? String(body.changeNote).slice(0, 255)
            : `更新至 v${nextVersion}`,
        createdBy: uid
      }
    })
    await this.writeAudit(row.id, uid, 'EDIT', { version: nextVersion })
    return this.mapWorkflow(updated, { withGraph: true })
  }

  async deleteWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { deletedAt: new Date() }
    })
    await this.writeAudit(row.id, uid, 'DELETE', { name: row.name })
    return true
  }

  async restoreWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const wid = this.parseId(id)
    const row = await this.prisma.client.workflow.findFirst({
      where: { id: wid, deletedAt: { not: null } },
      include: { category: true }
    })
    if (!row) throw new NotFoundException('回收站中不存在该流程')
    const restored = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { deletedAt: null, status: 'DRAFT' },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'RESTORE', { name: row.name })
    return this.mapWorkflow(restored, { withGraph: true })
  }

  async copyWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const src = await this.getWorkflowRow(id)
    try {
      const workflowNo = await this.allocateWorkflowNo()
      const row = await this.prisma.client.workflow.create({
        data: {
          workflowNo,
          name: `${src.name} (副本)`.slice(0, 128),
          description: src.description,
          icon: src.icon,
          categoryId: src.categoryId,
          tags: this.jsonInput(src.tags),
          status: 'DRAFT',
          currentVersion: 1,
          graphData: (src.graphData ?? EMPTY_GRAPH) as Prisma.InputJsonValue,
          globalConfig: this.jsonInput(src.globalConfig),
          creatorId: uid
        },
        include: { category: true }
      })
      await this.prisma.client.workflowVersion.create({
        data: {
          workflowId: row.id,
          version: 1,
          graphData: (src.graphData ?? EMPTY_GRAPH) as Prisma.InputJsonValue,
          globalConfig: this.jsonInput(src.globalConfig),
          changeNote: `复制自 ${src.workflowNo}`,
          createdBy: uid
        }
      })
      await this.writeAudit(row.id, uid, 'COPY', { source: src.workflowNo })
      return this.mapWorkflow(row, { withGraph: true })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('流程编号冲突，请重试')
      }
      throw e
    }
  }

  /** 提交发布审核：DRAFT/REJECTED → PENDING */
  async submitAudit(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['DRAFT', 'REJECTED'], '提交审核')
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { status: 'PENDING', auditRemark: null },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'PUBLISH', { to: 'PENDING' })
    return this.mapWorkflow(updated, { withGraph: false })
  }

  /** 审核：PENDING → PUBLISHED / REJECTED */
  async auditWorkflow(
    id: string | number,
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['PENDING'], '审核')
    const approved = body.approved === true || body.approved === 'true'
    const remark =
      body.remark != null ? String(body.remark).slice(0, 255) : null
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: {
        status: approved ? 'PUBLISHED' : 'REJECTED',
        auditorId: uid,
        auditedAt: new Date(),
        auditRemark: remark
      },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'AUDIT', { approved, remark })
    return this.mapWorkflow(updated, { withGraph: false })
  }

  async pauseWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['PUBLISHED'], '暂停')
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { status: 'PAUSED' },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'PAUSE', {})
    return this.mapWorkflow(updated, { withGraph: false })
  }

  async resumeWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['PAUSED'], '恢复')
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { status: 'PUBLISHED' },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'RESUME', {})
    return this.mapWorkflow(updated, { withGraph: false })
  }

  async offlineWorkflow(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['PUBLISHED', 'PAUSED'], '下线')
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: { status: 'OFFLINE' },
      include: { category: true }
    })
    await this.writeAudit(row.id, uid, 'OFFLINE', {})
    return this.mapWorkflow(updated, { withGraph: false })
  }

  async listVersions(id: string | number) {
    const row = await this.getWorkflowRow(id, { includeDeleted: true })
    const rows = await this.prisma.client.workflowVersion.findMany({
      where: { workflowId: row.id },
      orderBy: { version: 'desc' }
    })
    return { list: rows.map(v => this.mapVersion(v)), total: rows.length }
  }

  /** 回滚到指定版本：以该版本快照生成新版本（不覆盖历史） */
  async rollbackVersion(
    id: string | number,
    version: string | number,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    const v = Number(version)
    if (!Number.isInteger(v) || v < 1) {
      throw new BadRequestException('非法版本号')
    }
    const snapshot = await this.prisma.client.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId: row.id, version: v } }
    })
    if (!snapshot) throw new NotFoundException(`版本 v${v} 不存在`)

    const nextVersion = row.currentVersion + 1
    const updated = await this.prisma.client.workflow.update({
      where: { id: row.id },
      data: {
        graphData: snapshot.graphData as Prisma.InputJsonValue,
        globalConfig: this.jsonInput(snapshot.globalConfig),
        currentVersion: nextVersion
      },
      include: { category: true }
    })
    await this.prisma.client.workflowVersion.create({
      data: {
        workflowId: row.id,
        version: nextVersion,
        graphData: snapshot.graphData as Prisma.InputJsonValue,
        globalConfig: this.jsonInput(snapshot.globalConfig),
        changeNote: `回滚自 v${v}`,
        createdBy: uid
      }
    })
    await this.writeAudit(row.id, uid, 'ROLLBACK', { from: v, to: nextVersion })
    return this.mapWorkflow(updated, { withGraph: true })
  }

  // ==================== 执行管理 ====================

  /**
   * 手动触发执行（PUBLISHED 才可触发）
   * TODO: CRON 定时调度本期不实现——后续接入 @nestjs/schedule，
   * 扫描 PUBLISHED 流程的 TRIGGER 节点 config.cron 表达式并触发 startExecution。
   */
  async executeWorkflow(
    id: string | number,
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(row.status, ['PUBLISHED'], '执行')
    const executionId = await this.startExecution(
      row.id,
      row.currentVersion,
      row.graphData,
      'MANUAL',
      { input: body.input ?? null, userId: Number(uid) },
      { trigger: body.input ?? {} }
    )
    await this.writeAudit(row.id, uid, 'EXECUTE', { executionId: Number(executionId) })
    return this.getExecution(executionId)
  }

  /** 测试运行：草稿态执行（不写入正式历史的统计口径，仅 triggerData 标记 test） */
  async testWorkflow(
    id: string | number,
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const row = await this.getWorkflowRow(id)
    this.assertStatus(
      row.status,
      ['DRAFT', 'REJECTED', 'PENDING'],
      '测试运行'
    )
    const executionId = await this.startExecution(
      row.id,
      row.currentVersion,
      row.graphData,
      'MANUAL',
      { input: body.input ?? null, test: true, userId: Number(uid) },
      { trigger: body.input ?? {} }
    )
    await this.writeAudit(row.id, uid, 'EXECUTE', {
      executionId: Number(executionId),
      test: true
    })
    return this.getExecution(executionId)
  }

  /** 创建执行实例并同步跑完（runExecution 内部吞错写 FAILED） */
  private async startExecution(
    workflowId: bigint,
    workflowVersion: number,
    graphData: unknown,
    triggerType: string,
    triggerData: Record<string, unknown>,
    initialContext: Record<string, unknown>
  ): Promise<bigint> {
    const execution = await this.prisma.client.workflowExecution.create({
      data: {
        executionNo: await this.allocateExecutionNo(),
        workflowId,
        workflowVersion,
        status: 'RUNNING',
        triggerType,
        triggerData: triggerData as Prisma.InputJsonValue,
        startedAt: new Date()
      }
    })
    const graph = this.parseGraph(graphData)
    await this.runExecution(execution.id, graph, initialContext)
    return execution.id
  }

  async listExecutions(params: {
    page?: number
    pageSize?: number
    workflowId?: string | number
    status?: string
    triggerType?: string
    startTime?: string
    endTime?: string
  }) {
    const { skip, take } = this.parsePagination(params)
    const start = this.parseDate(params.startTime, '开始')
    const end = this.parseDate(params.endTime, '结束')
    const where: Prisma.WorkflowExecutionWhereInput = {
      ...(params.workflowId
        ? { workflowId: this.parseId(params.workflowId) }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.triggerType ? { triggerType: params.triggerType } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {})
            }
          }
        : {})
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.workflowExecution.count({ where }),
      this.prisma.client.workflowExecution.findMany({
        where,
        include: { workflow: { select: { id: true, name: true, workflowNo: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])
    return { list: rows.map(r => this.mapExecution(r)), total }
  }

  /** 我创建的流程的执行记录 */
  async myExecutions(
    auth: AuthInfo | undefined,
    params: {
      page?: number
      pageSize?: number
      status?: string
      triggerType?: string
    }
  ) {
    const uid = this.resolveUid(auth)
    const myWorkflows = await this.prisma.client.workflow.findMany({
      where: { creatorId: uid, deletedAt: null },
      select: { id: true }
    })
    const ids = myWorkflows.map(w => w.id)
    const { skip, take } = this.parsePagination(params)
    const where: Prisma.WorkflowExecutionWhereInput = {
      workflowId: { in: ids },
      ...(params.status ? { status: params.status } : {}),
      ...(params.triggerType ? { triggerType: params.triggerType } : {})
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.workflowExecution.count({ where }),
      this.prisma.client.workflowExecution.findMany({
        where,
        include: { workflow: { select: { id: true, name: true, workflowNo: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ])
    return { list: rows.map(r => this.mapExecution(r)), total }
  }

  async getExecution(id: string | number | bigint) {
    const eid = this.parseId(id)
    const row = await this.prisma.client.workflowExecution.findUnique({
      where: { id: eid },
      include: {
        workflow: { select: { id: true, name: true, workflowNo: true } },
        stepLogs: { orderBy: { createdAt: 'asc' } }
      }
    })
    if (!row) throw new NotFoundException('执行记录不存在')
    return {
      ...this.mapExecution(row),
      stepLogs: row.stepLogs.map(l => this.mapStepLog(l))
    }
  }

  async getExecutionLogs(id: string | number) {
    const eid = this.parseId(id)
    const row = await this.prisma.client.workflowExecution.findUnique({
      where: { id: eid },
      select: { id: true }
    })
    if (!row) throw new NotFoundException('执行记录不存在')
    const logs = await this.prisma.client.executionStepLog.findMany({
      where: { executionId: eid },
      orderBy: { createdAt: 'asc' }
    })
    return { list: logs.map(l => this.mapStepLog(l)), total: logs.length }
  }

  async cancelExecution(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const eid = this.parseId(id)
    const row = await this.prisma.client.workflowExecution.findUnique({
      where: { id: eid }
    })
    if (!row) throw new NotFoundException('执行记录不存在')
    if (!['PENDING', 'RUNNING', 'PAUSED'].includes(row.status)) {
      throw new BadRequestException(`当前状态 ${row.status} 不允许取消`)
    }
    const updated = await this.prisma.client.workflowExecution.update({
      where: { id: eid },
      data: { status: 'CANCELLED', finishedAt: new Date() }
    })
    await this.writeAudit(row.workflowId, uid, 'CANCEL', {
      executionNo: row.executionNo
    })
    return this.mapExecution(updated)
  }

  /** 基于历史执行的输入重新执行 */
  async rerunExecution(id: string | number, auth?: AuthInfo) {
    const uid = this.resolveUid(auth)
    const eid = this.parseId(id)
    const row = await this.prisma.client.workflowExecution.findUnique({
      where: { id: eid },
      include: { workflow: true }
    })
    if (!row) throw new NotFoundException('执行记录不存在')
    if (row.workflow.deletedAt) {
      throw new BadRequestException('流程已删除，无法重新执行')
    }
    this.assertStatus(row.workflow.status, ['PUBLISHED'], '重新执行')
    const triggerData = (row.triggerData ?? {}) as Record<string, unknown>
    const input = triggerData.input ?? {}
    const executionId = await this.startExecution(
      row.workflowId,
      row.workflow.currentVersion,
      row.workflow.graphData,
      'MANUAL',
      { input, rerunOf: row.executionNo, userId: Number(uid) },
      { trigger: input }
    )
    await this.writeAudit(row.workflowId, uid, 'EXECUTE', {
      executionId: Number(executionId),
      rerunOf: row.executionNo
    })
    return this.getExecution(executionId)
  }

  /**
   * Webhook 触发入口：按 path + method 匹配已发布流程的 TRIGGER 节点
   * TODO: HMAC / Bearer Token 认证校验（TRIGGER config.authType/authSecret）
   */
  async triggerByWebhook(
    path: string,
    method: string,
    payload: { headers?: unknown; query?: unknown; body?: unknown }
  ) {
    const normalize = (p: string) =>
      p
        .replace(/^\/+|\/+$/g, '')
        .replace(/^webhook\//i, '')
        .toLowerCase()
    const target = normalize(path)
    if (!target) throw new BadRequestException('非法 Webhook 路径')

    const published = await this.prisma.client.workflow.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: {
        id: true,
        name: true,
        currentVersion: true,
        graphData: true
      }
    })

    for (const wf of published) {
      const graph = this.parseGraph(wf.graphData)
      const trigger = graph.nodes.find(
        n => String(n.type || '').toUpperCase() === 'TRIGGER'
      )
      const config = (trigger?.config ?? {}) as Record<string, unknown>
      if (String(config.triggerType || '').toUpperCase() !== 'WEBHOOK') continue
      const cfgPath = normalize(String(config.path || ''))
      if (!cfgPath || cfgPath !== target) continue
      const cfgMethod = String(config.method || 'POST').toUpperCase()
      if (cfgMethod !== method.toUpperCase()) continue

      const execution = await this.prisma.client.workflowExecution.create({
        data: {
          executionNo: await this.allocateExecutionNo(),
          workflowId: wf.id,
          workflowVersion: wf.currentVersion,
          status: 'RUNNING',
          triggerType: 'WEBHOOK',
          triggerData: {
            headers: payload.headers ?? {},
            query: payload.query ?? {},
            body: payload.body ?? {}
          } as Prisma.InputJsonValue,
          startedAt: new Date()
        }
      })
      // 异步执行：Webhook 需在 3 秒内返回 200
      void this.runExecution(
        execution.id,
        graph,
        { trigger: payload.body ?? payload.query ?? {} }
      ).catch(() => {})
      return {
        received: true,
        workflowId: Number(wf.id),
        workflowName: wf.name,
        executionNo: execution.executionNo
      }
    }
    throw new NotFoundException(`未找到匹配的 Webhook: /webhook/${target}`)
  }

  // ==================== 执行引擎（简化实现） ====================

  /**
   * 执行引擎（简化版）：
   * 1. Kahn 拓扑排序得到执行序列（TRIGGER 节点不参与）
   * 2. 逐节点创建 ExecutionStepLog（RUNNING → SUCCEEDED/FAILED）
   * 3. 节点输出写入执行上下文，结束后整体回写
   * 4. 异常时执行实例置 FAILED + errorMessage + errorNodeId
   * TODO: 并行分支调度 / 节点级重试与错误策略（RETRY/SKIP/ABORT/ERROR_BRANCH）
   * TODO: 超时控制（节点 60s / Agent 120s / Tool 30s / 全局 30min）
   */
  private async runExecution(
    executionId: bigint,
    graph: ParsedGraph,
    initialContext: Record<string, unknown>
  ): Promise<void> {
    const startedAt = Date.now()
    const context: Record<string, unknown> = { ...(initialContext || {}) }
    try {
      const order = this.topoSort(graph.nodes, graph.edges)
      const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
      for (const nodeId of order) {
        const node = nodeMap.get(nodeId)
        if (!node) continue
        const step = await this.prisma.client.executionStepLog.create({
          data: {
            executionId,
            nodeId: node.id,
            nodeType: String(node.type || 'UNKNOWN'),
            nodeName: node.name,
            status: 'RUNNING',
            inputData: { config: node.config ?? {} } as Prisma.InputJsonValue,
            startedAt: new Date()
          }
        })
        try {
          const outputData = this.mockNodeOutput(node, graph.edges)
          // 模拟节点耗时 100-800ms（随机数，不真实等待）
          const durationMs = 100 + Math.floor(Math.random() * 700)
          context[`node:${nodeId}`] = outputData
          await this.prisma.client.executionStepLog.update({
            where: { id: step.id },
            data: {
              status: 'SUCCEEDED',
              outputData: outputData as Prisma.InputJsonValue,
              durationMs,
              finishedAt: new Date()
            }
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await this.prisma.client.executionStepLog.update({
            where: { id: step.id },
            data: {
              status: 'FAILED',
              errorMessage: message,
              finishedAt: new Date()
            }
          })
          const wrapped = new Error(
            `节点 ${node.id}(${node.name || node.type}) 执行失败: ${message}`
          ) as Error & { nodeId?: string }
          wrapped.nodeId = node.id
          throw wrapped
        }
      }
      await this.prisma.client.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'SUCCEEDED',
          context: context as Prisma.InputJsonValue,
          result: {
            nodeCount: order.length,
            finishedAt: new Date().toISOString()
          } as Prisma.InputJsonValue,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date()
        }
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const nodeId = (err as { nodeId?: string }).nodeId ?? null
      await this.prisma.client.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: message,
          errorNodeId: nodeId,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date()
        }
      })
    }
  }

  /** Kahn 拓扑排序：返回除 TRIGGER 外的执行序列（存在环时剩余节点按声明顺序兜底追加） */
  private topoSort(
    nodes: GraphNode[],
    edges: { source: string; target: string }[]
  ): string[] {
    const stepNodes = nodes.filter(
      n => n.id && String(n.type || '').toUpperCase() !== 'TRIGGER'
    )
    const inDeg = new Map<string, number>()
    const adj = new Map<string, string[]>()
    for (const n of stepNodes) {
      inDeg.set(n.id, 0)
      adj.set(n.id, [])
    }
    for (const e of edges) {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.push(e.target)
        inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1)
      }
    }
    const queue = stepNodes
      .filter(n => (inDeg.get(n.id) || 0) === 0)
      .map(n => n.id)
    const order: string[] = []
    while (queue.length) {
      const cur = queue.shift()!
      order.push(cur)
      for (const next of adj.get(cur) || []) {
        const d = (inDeg.get(next) || 0) - 1
        inDeg.set(next, d)
        if (d === 0) queue.push(next)
      }
    }
    if (order.length < stepNodes.length) {
      const done = new Set(order)
      for (const n of stepNodes) {
        if (!done.has(n.id)) order.push(n.id)
      }
    }
    return order
  }

  /** 节点模拟输出（TODO: 接入真实执行器） */
  private mockNodeOutput(
    node: GraphNode,
    edges: { source: string; target: string }[]
  ): Record<string, unknown> {
    const type = String(node.type || '').toUpperCase()
    const config = node.config ?? {}
    if (type === 'AGENT') {
      // TODO: 接入 LangChain 按系统提示词真实调用 LLM
      return { text: '(模拟 AI 输出，待接入 LangChain)' }
    }
    if (type === 'TOOL') {
      // TODO: 按 config.toolCode 调用 WorkflowTool 定义的真实 API
      return { ok: true }
    }
    if (type === 'CONDITION') {
      // 简化实现：命中第一条出边
      const first = edges.find(e => e.source === node.id)
      return { branch: first ? first.target : null }
    }
    if (type === 'TRANSFORM') {
      // 简化实现：透传配置
      return { passthrough: true }
    }
    if (type === 'OUTPUT') {
      // 记录输出配置
      return {
        outputType: config.outputType ?? null,
        delivered: true
      }
    }
    return { ok: true }
  }

  // ==================== 序列化 ====================

  private mapWorkflow(
    row: {
      id: bigint
      workflowNo: string
      name: string
      description?: string | null
      icon?: string | null
      categoryId: bigint
      tags?: Prisma.JsonValue | null
      status: string
      currentVersion: number
      graphData?: Prisma.JsonValue | null
      globalConfig?: Prisma.JsonValue | null
      creatorId: bigint
      auditorId?: bigint | null
      auditedAt?: Date | null
      auditRemark?: string | null
      createdAt: Date
      updatedAt: Date
      deletedAt?: Date | null
      category?: {
        id: bigint
        name: string
        code: string
      } | null
    },
    opts?: {
      withGraph?: boolean
      executionCount?: number
      lastExecutedAt?: Date | null
    }
  ) {
    return {
      id: Number(row.id),
      workflowNo: row.workflowNo,
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      categoryId: Number(row.categoryId),
      category: row.category
        ? {
            id: Number(row.category.id),
            name: row.category.name,
            code: row.category.code
          }
        : null,
      tags: row.tags ?? null,
      status: row.status,
      currentVersion: row.currentVersion,
      triggerType: this.extractTriggerType(row.graphData),
      ...(opts?.withGraph
        ? {
            graphData: row.graphData ?? null,
            globalConfig: row.globalConfig ?? null
          }
        : {}),
      creatorId: Number(row.creatorId),
      auditorId: row.auditorId != null ? Number(row.auditorId) : null,
      auditedAt: this.toIso(row.auditedAt),
      auditRemark: row.auditRemark ?? null,
      executionCount: opts?.executionCount ?? 0,
      lastExecutedAt: this.toIso(opts?.lastExecutedAt ?? null),
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
      deletedAt: this.toIso(row.deletedAt ?? null)
    }
  }

  private mapVersion(row: {
    id: bigint
    workflowId: bigint
    version: number
    changeNote?: string | null
    createdBy: bigint
    createdAt: Date
  }) {
    return {
      id: Number(row.id),
      workflowId: Number(row.workflowId),
      version: row.version,
      changeNote: row.changeNote ?? null,
      createdBy: Number(row.createdBy),
      createdAt: this.toIso(row.createdAt)
    }
  }

  private mapExecution(
    row: {
      id: bigint
      executionNo: string
      workflowId: bigint
      workflowVersion: number
      status: string
      triggerType: string
      triggerData?: Prisma.JsonValue | null
      context?: Prisma.JsonValue | null
      result?: Prisma.JsonValue | null
      errorMessage?: string | null
      errorNodeId?: string | null
      durationMs?: number | null
      startedAt?: Date | null
      finishedAt?: Date | null
      createdAt: Date
      updatedAt: Date
      workflow?: {
        id: bigint
        name: string
        workflowNo: string
      } | null
    }
  ) {
    return {
      id: Number(row.id),
      executionNo: row.executionNo,
      workflowId: Number(row.workflowId),
      workflowVersion: row.workflowVersion,
      workflow: row.workflow
        ? {
            id: Number(row.workflow.id),
            name: row.workflow.name,
            workflowNo: row.workflow.workflowNo
          }
        : null,
      status: row.status,
      triggerType: row.triggerType,
      triggerData: row.triggerData ?? null,
      result: row.result ?? null,
      errorMessage: row.errorMessage ?? null,
      errorNodeId: row.errorNodeId ?? null,
      durationMs: row.durationMs ?? null,
      startedAt: this.toIso(row.startedAt),
      finishedAt: this.toIso(row.finishedAt),
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }

  private mapStepLog(row: {
    id: bigint
    executionId: bigint
    nodeId: string
    nodeType: string
    nodeName?: string | null
    status: string
    inputData?: Prisma.JsonValue | null
    outputData?: Prisma.JsonValue | null
    errorMessage?: string | null
    retryCount: number
    durationMs?: number | null
    startedAt?: Date | null
    finishedAt?: Date | null
    createdAt: Date
  }) {
    return {
      id: Number(row.id),
      executionId: Number(row.executionId),
      nodeId: row.nodeId,
      nodeType: row.nodeType,
      nodeName: row.nodeName ?? null,
      status: row.status,
      inputData: row.inputData ?? null,
      outputData: row.outputData ?? null,
      errorMessage: row.errorMessage ?? null,
      retryCount: row.retryCount,
      durationMs: row.durationMs ?? null,
      startedAt: this.toIso(row.startedAt),
      finishedAt: this.toIso(row.finishedAt),
      createdAt: this.toIso(row.createdAt)
    }
  }
}
