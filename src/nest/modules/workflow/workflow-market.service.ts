import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import axios from 'axios'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowService } from './workflow.service'

type AuthInfo = { uid?: string | number }

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']

const OPENAPI_OPERATIONS = ['get', 'post', 'put', 'delete', 'patch']

@Injectable()
export class WorkflowMarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService
  ) {}

  // ==================== 工具管理 ====================

  async listTools(params: {
    page?: number
    pageSize?: number
    keyword?: string
    category?: string
    enabled?: string
    isBuiltin?: string
  }) {
    const { skip, take } = this.parsePagination(params)
    const where: Prisma.WorkflowToolWhereInput = {
      ...(params.category ? { category: params.category } : {}),
      ...(params.enabled === 'true' || params.enabled === 'false'
        ? { enabled: params.enabled === 'true' }
        : {}),
      ...(params.isBuiltin === 'true' || params.isBuiltin === 'false'
        ? { isBuiltin: params.isBuiltin === 'true' }
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
      this.prisma.client.workflowTool.count({ where }),
      this.prisma.client.workflowTool.findMany({
        where,
        orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'desc' }],
        skip,
        take
      })
    ])
    return { list: rows.map(r => this.mapTool(r)), total }
  }

  async createTool(
    body: Record<string, unknown>,
    auth?: AuthInfo
  ): Promise<Record<string, unknown>> {
    const uid = this.resolveUid(auth)
    const name = String(body.name || '').trim()
    if (!name || name.length > 64) {
      throw new BadRequestException('工具名称必填且不超过 64 字符')
    }
    const code = String(body.code || '').trim()
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
      throw new BadRequestException(
        '工具编码仅允许字母/数字/下划线/中划线，长度 1-64'
      )
    }
    const category = String(body.category || '').trim()
    if (!category || category.length > 32) {
      throw new BadRequestException('工具分类必填且不超过 32 字符')
    }
    const method = String(body.method || 'GET').toUpperCase()
    if (!HTTP_METHODS.includes(method)) {
      throw new BadRequestException('非法 HTTP 方法')
    }
    if (body.paramSchema == null || typeof body.paramSchema !== 'object') {
      throw new BadRequestException('参数 Schema（paramSchema）必填且为对象')
    }
    try {
      const row = await this.prisma.client.workflowTool.create({
        data: {
          name,
          code,
          category,
          description:
            body.description != null
              ? String(body.description).slice(0, 255)
              : null,
          icon: body.icon != null ? String(body.icon) : null,
          endpoint:
            body.endpoint != null
              ? String(body.endpoint).slice(0, 255)
              : null,
          method,
          authConfig:
            body.authConfig != null && typeof body.authConfig === 'object'
              ? (body.authConfig as Prisma.InputJsonValue)
              : Prisma.DbNull,
          paramSchema: body.paramSchema as Prisma.InputJsonValue,
          outputSchema:
            body.outputSchema != null && typeof body.outputSchema === 'object'
              ? (body.outputSchema as Prisma.InputJsonValue)
              : Prisma.DbNull,
          isBuiltin: false,
          enabled:
            body.enabled == null
              ? true
              : body.enabled === true || body.enabled === 'true',
          creatorId: uid
        }
      })
      return this.mapTool(row)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('工具编码已存在')
      }
      throw e
    }
  }

  async updateTool(id: string | number, body: Record<string, unknown>) {
    const tool = await this.getToolRow(id)
    const data: Prisma.WorkflowToolUpdateInput = {}
    if (body.name != null) {
      const name = String(body.name).trim()
      if (!name || name.length > 64) {
        throw new BadRequestException('工具名称必填且不超过 64 字符')
      }
      data.name = name
    }
    if (body.code != null) {
      const code = String(body.code).trim()
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        throw new BadRequestException(
          '工具编码仅允许字母/数字/下划线/中划线，长度 1-64'
        )
      }
      data.code = code
    }
    if (body.category != null) {
      const category = String(body.category).trim()
      if (!category || category.length > 32) {
        throw new BadRequestException('工具分类必填且不超过 32 字符')
      }
      data.category = category
    }
    if (body.description !== undefined) {
      data.description =
        body.description == null
          ? null
          : String(body.description).slice(0, 255)
    }
    if (body.icon !== undefined) {
      data.icon = body.icon == null ? null : String(body.icon)
    }
    if (body.endpoint !== undefined) {
      data.endpoint =
        body.endpoint == null ? null : String(body.endpoint).slice(0, 255)
    }
    if (body.method != null) {
      const method = String(body.method).toUpperCase()
      if (!HTTP_METHODS.includes(method)) {
        throw new BadRequestException('非法 HTTP 方法')
      }
      data.method = method
    }
    if (body.authConfig !== undefined) {
      data.authConfig =
        body.authConfig != null && typeof body.authConfig === 'object'
          ? (body.authConfig as Prisma.InputJsonValue)
          : Prisma.DbNull
    }
    if (body.paramSchema != null) {
      if (typeof body.paramSchema !== 'object') {
        throw new BadRequestException('paramSchema 必须为对象')
      }
      data.paramSchema = body.paramSchema as Prisma.InputJsonValue
    }
    if (body.outputSchema !== undefined) {
      data.outputSchema =
        body.outputSchema != null && typeof body.outputSchema === 'object'
          ? (body.outputSchema as Prisma.InputJsonValue)
          : Prisma.DbNull
    }
    if (body.enabled !== undefined) {
      data.enabled = body.enabled === true || body.enabled === 'true'
    }
    try {
      const updated = await this.prisma.client.workflowTool.update({
        where: { id: tool.id },
        data
      })
      return this.mapTool(updated)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('工具编码已存在')
      }
      throw e
    }
  }

  async deleteTool(id: string | number) {
    const tool = await this.getToolRow(id)
    if (tool.isBuiltin) {
      throw new BadRequestException('内置工具不允许删除')
    }
    await this.prisma.client.workflowTool.delete({ where: { id: tool.id } })
    return true
  }

  /**
   * 导入 OpenAPI（Swagger）定义，批量生成 HTTP 工具
   * 简化实现：仅解析 body.spec（OpenAPI 3.x JSON 对象）
   * TODO: 支持 body.url 远程拉取 spec 文件
   */
  async importToolFromOpenApi(
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const uid = this.resolveUid(auth)
    const spec = body.spec
    if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new BadRequestException('缺少 OpenAPI 定义（spec 字段必填且为对象）')
    }
    const specObj = spec as Record<string, unknown>
    const paths = specObj.paths
    if (paths == null || typeof paths !== 'object' || Array.isArray(paths)) {
      throw new BadRequestException('OpenAPI 定义缺少 paths')
    }
    const servers = Array.isArray(specObj.servers) ? specObj.servers : []
    const baseUrl =
      servers.length && typeof servers[0] === 'object'
        ? String((servers[0] as Record<string, unknown>).url || '')
        : ''

    const imported: Record<string, unknown>[] = []
    let skipped = 0
    for (const [route, pathItem] of Object.entries(paths)) {
      if (pathItem == null || typeof pathItem !== 'object') continue
      const item = pathItem as Record<string, unknown>
      for (const op of OPENAPI_OPERATIONS) {
        const operation = item[op]
        if (operation == null || typeof operation !== 'object') continue
        const opObj = operation as Record<string, unknown>
        const code = this.slugify(
          String(opObj.operationId || `${op}_${route}`)
        ).slice(0, 64)
        if (!code) {
          skipped++
          continue
        }
        const exists = await this.prisma.client.workflowTool.findUnique({
          where: { code },
          select: { id: true }
        })
        if (exists) {
          skipped++
          continue
        }
        const row = await this.prisma.client.workflowTool.create({
          data: {
            name: String(opObj.summary || `${op.toUpperCase()} ${route}`).slice(
              0,
              64
            ),
            code,
            category: 'HTTP',
            description:
              opObj.description != null
                ? String(opObj.description).slice(0, 255)
                : null,
            endpoint: `${baseUrl}${route}`.slice(0, 255),
            method: op.toUpperCase(),
            paramSchema: this.extractParamSchema(
              opObj
            ) as Prisma.InputJsonValue,
            isBuiltin: false,
            creatorId: uid
          }
        })
        imported.push(this.mapTool(row))
      }
    }
    return { imported, importedCount: imported.length, skipped }
  }

  /**
   * 测试工具调用：按 endpoint/method 真实发起 HTTP 请求（10s 超时）
   * 无 endpoint 的工具返回模拟结果
   */
  async testTool(id: string | number, body: Record<string, unknown>) {
    const tool = await this.getToolRow(id)
    const params =
      body.params != null && typeof body.params === 'object'
        ? (body.params as Record<string, unknown>)
        : {}
    if (!tool.endpoint) {
      return {
        ok: true,
        mocked: true,
        toolCode: tool.code,
        params
      }
    }
    const startedAt = Date.now()
    try {
      const response = await axios.request({
        url: tool.endpoint,
        method: tool.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        ...(tool.method === 'GET' ? { params } : { data: params }),
        timeout: 10000
      })
      return {
        ok: true,
        mocked: false,
        toolCode: tool.code,
        status: response.status,
        durationMs: Date.now() - startedAt,
        data: this.truncateResponseData(response.data)
      }
    } catch (err) {
      const e = err as {
        response?: { status?: number; data?: unknown }
        message?: string
      }
      return {
        ok: false,
        mocked: false,
        toolCode: tool.code,
        status: e.response?.status ?? null,
        durationMs: Date.now() - startedAt,
        error: this.truncateResponseData(
          e.response?.data ?? e.message ?? '请求失败'
        )
      }
    }
  }

  // ==================== 模板管理 ====================

  async listTemplates(params: {
    page?: number
    pageSize?: number
    keyword?: string
    category?: string
    isOfficial?: string
  }) {
    const { skip, take } = this.parsePagination(params)
    const where: Prisma.WorkflowTemplateWhereInput = {
      enabled: true,
      ...(params.category ? { category: params.category } : {}),
      ...(params.isOfficial === 'true' || params.isOfficial === 'false'
        ? { isOfficial: params.isOfficial === 'true' }
        : {}),
      ...(params.keyword
        ? {
            OR: [
              { name: { contains: params.keyword } },
              { description: { contains: params.keyword } }
            ]
          }
        : {})
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.workflowTemplate.count({ where }),
      this.prisma.client.workflowTemplate.findMany({
        where,
        orderBy: [{ isOfficial: 'desc' }, { installCount: 'desc' }],
        skip,
        take
      })
    ])
    return {
      list: rows.map(r => this.mapTemplate(r, { withGraph: false })),
      total
    }
  }

  async getTemplate(id: string | number) {
    const tid = this.parseId(id)
    const row = await this.prisma.client.workflowTemplate.findUnique({
      where: { id: tid }
    })
    if (!row) throw new NotFoundException('模板不存在')
    return this.mapTemplate(row, { withGraph: true })
  }

  /** 一键安装模板：以模板画布数据创建 DRAFT 流程（v1 快照），installCount + 1 */
  async installTemplate(
    id: string | number,
    body: Record<string, unknown>,
    auth?: AuthInfo
  ) {
    const tid = this.parseId(id)
    const template = await this.prisma.client.workflowTemplate.findUnique({
      where: { id: tid }
    })
    if (!template) throw new NotFoundException('模板不存在')
    if (!template.enabled) throw new BadRequestException('模板已下架')

    let categoryId: bigint | null = null
    if (body.categoryId != null) {
      categoryId = this.parseId(body.categoryId)
    } else {
      const first = await this.prisma.client.workflowCategory.findFirst({
        where: { enabled: true },
        orderBy: { sortOrder: 'asc' }
      })
      categoryId = first?.id ?? null
    }
    if (categoryId == null) {
      throw new BadRequestException('请指定安装到的分类（系统尚无可用分类）')
    }

    const workflow = await this.workflowService.createWorkflow(
      {
        name: String(body.name || template.name).slice(0, 128),
        description: template.description,
        icon: template.icon,
        categoryId: String(categoryId),
        tags: ['template', template.category],
        graphData: template.graphData,
        globalConfig: template.globalConfig
      },
      auth
    )
    await this.prisma.client.workflowTemplate.update({
      where: { id: tid },
      data: { installCount: { increment: 1 } }
    })
    return { templateId: Number(tid), workflow }
  }

  /** 发布模板：可直接传 graphData，或从已有流程（workflowId）提取画布数据 */
  async createTemplate(
    body: Record<string, unknown>,
    auth?: AuthInfo
  ): Promise<Record<string, unknown>> {
    const uid = this.resolveUid(auth)
    const name = String(body.name || '').trim()
    if (!name || name.length > 128) {
      throw new BadRequestException('模板名称必填且不超过 128 字符')
    }
    const category = String(body.category || '').trim()
    if (!category || category.length > 32) {
      throw new BadRequestException('模板分类必填且不超过 32 字符')
    }

    let graphData = body.graphData
    let globalConfig = body.globalConfig
    let description = body.description != null ? String(body.description) : null
    let icon = body.icon != null ? String(body.icon) : null

    if (body.workflowId != null) {
      const wf = await this.prisma.client.workflow.findFirst({
        where: { id: this.parseId(body.workflowId), deletedAt: null }
      })
      if (!wf) throw new NotFoundException('来源流程不存在')
      graphData = wf.graphData
      globalConfig = wf.globalConfig
      if (description == null) description = wf.description
      if (icon == null) icon = wf.icon
    }
    if (graphData == null || typeof graphData !== 'object' || Array.isArray(graphData)) {
      throw new BadRequestException('模板画布数据 graphData 必填（或提供 workflowId）')
    }

    const row = await this.prisma.client.workflowTemplate.create({
      data: {
        name,
        description,
        icon,
        category,
        graphData: graphData as Prisma.InputJsonValue,
        globalConfig:
          globalConfig != null && typeof globalConfig === 'object'
            ? (globalConfig as Prisma.InputJsonValue)
            : Prisma.DbNull,
        previewImage:
          body.previewImage != null
            ? String(body.previewImage).slice(0, 255)
            : null,
        authorId: uid,
        isOfficial: body.isOfficial === true || body.isOfficial === 'true',
        enabled: true
      }
    })
    return this.mapTemplate(row, { withGraph: true })
  }

  // ==================== 私有工具方法 ====================

  private resolveUid(auth?: AuthInfo): bigint {
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

  private async getToolRow(id: string | number) {
    const tid = this.parseId(id)
    const row = await this.prisma.client.workflowTool.findUnique({
      where: { id: tid }
    })
    if (!row) throw new NotFoundException('工具不存在')
    return row
  }

  /** OpenAPI operationId / 路径 → 工具编码（小写字母数字下划线） */
  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/\{([^}]+)\}/g, '-$1-')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  /** 从 OpenAPI operation.parameters 提取参数 Schema */
  private extractParamSchema(
    operation: Record<string, unknown>
  ): Record<string, unknown> {
    const params = Array.isArray(operation.parameters)
      ? operation.parameters
      : []
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const p of params) {
      if (p == null || typeof p !== 'object') continue
      const param = p as Record<string, unknown>
      if (typeof param.name !== 'string' || !param.name) continue
      const schema =
        param.schema != null && typeof param.schema === 'object'
          ? (param.schema as Record<string, unknown>)
          : {}
      properties[param.name] = {
        type: String(schema.type || 'string'),
        in: String(param.in || 'query'),
        description: param.description != null ? String(param.description) : null
      }
      if (param.required === true) required.push(param.name)
    }
    return { type: 'object', properties, required }
  }

  /** 响应体过大时截断，避免测试结果爆量 */
  private truncateResponseData(data: unknown): unknown {
    if (typeof data === 'string') return data.slice(0, 2000)
    return data
  }

  // ==================== 序列化 ====================

  private mapTool(row: {
    id: bigint
    name: string
    code: string
    category: string
    description?: string | null
    icon?: string | null
    endpoint?: string | null
    method: string
    authConfig?: Prisma.JsonValue | null
    paramSchema: Prisma.JsonValue
    outputSchema?: Prisma.JsonValue | null
    isBuiltin: boolean
    enabled: boolean
    creatorId?: bigint | null
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      code: row.code,
      category: row.category,
      description: row.description ?? null,
      icon: row.icon ?? null,
      endpoint: row.endpoint ?? null,
      method: row.method,
      authConfig: row.authConfig ?? null,
      paramSchema: row.paramSchema ?? null,
      outputSchema: row.outputSchema ?? null,
      isBuiltin: row.isBuiltin,
      enabled: row.enabled,
      creatorId: row.creatorId != null ? Number(row.creatorId) : null,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }

  private mapTemplate(
    row: {
      id: bigint
      name: string
      description?: string | null
      icon?: string | null
      category: string
      graphData: Prisma.JsonValue
      globalConfig?: Prisma.JsonValue | null
      previewImage?: string | null
      authorId?: bigint | null
      isOfficial: boolean
      installCount: number
      rating: Prisma.Decimal
      enabled: boolean
      createdAt: Date
      updatedAt: Date
    },
    opts?: { withGraph?: boolean }
  ) {
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      category: row.category,
      ...(opts?.withGraph
        ? {
            graphData: row.graphData ?? null,
            globalConfig: row.globalConfig ?? null
          }
        : {}),
      previewImage: row.previewImage ?? null,
      authorId: row.authorId != null ? Number(row.authorId) : null,
      isOfficial: row.isOfficial,
      installCount: row.installCount,
      rating: row.rating != null ? Number(row.rating) : 0,
      enabled: row.enabled,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }
}
