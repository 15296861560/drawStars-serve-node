import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { RbacService } from '../rbac/rbac.service'
import { rawQuery } from '../../../db/raw-query'
import { AiAssistantLlmService } from './ai-assistant.llm'
import type { AiMessage } from './ai-assistant.types'

/**
 * AI 数据问数（PRD 4.5 / 4.5.3 / 4.5.4 / 5.4 / 5.5）：
 * 两层权限（问数功能码 + 数据集业务码）→ NL2SQL 生成 → 词法安全校验 →
 * 只读执行（强制 LIMIT 200 + 5s 超时）→ 表格回复 → 全量审计落库 → 内存限流。
 * 用户问句永不拼接 SQL，LLM 仅按白名单数据字典生成候选语句。
 */

/** 问数功能权限码（第一层）：拥有后才可进入 NL2SQL 流程 */
export const AI_QUERY_PERMISSION = 'system:ai-assistant:query'

/** 与前端 QUERY_INTENT_RE 保持一致的问数意图词 */
const QUERY_INTENT_RE =
  /多少|几条|几个|几人|统计|汇总|排行|排名|榜单|top\s*\d*|总量|总数|总计|占比|比例|完成率|发放量|明细|分布|趋势|有没有|哪些|情况如何|看一下|查询|查一下|帮我查|数量/i

/** 单次最多返回行数（PRD 4.5.4：服务端强制 LIMIT） */
export const MAX_QUERY_ROWS = 200

/** 只读查询超时（毫秒） */
const QUERY_TIMEOUT_MS = 5_000
const QUERY_TIMEOUT_MESSAGE = 'AI_QUERY_TIMEOUT'

/** 问数限流：每用户每分钟 10 次、每天 200 次（PRD 4.5.1） */
const RATE_LIMIT_PER_MINUTE = 10
const RATE_LIMIT_PER_DAY = 200

/** 禁止出现的 SQL 语句/函数（词边界，PRD 4.5.4 安全基线） */
const FORBIDDEN_SQL_RE =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|lock|unlock|call|execute|set|replace|merge|rename|handler|kill|load_file|outfile|dumpfile|information_schema|performance_schema|mysql|sleep|benchmark)\b/i

/** 全局敏感字段基线（词边界拦截；数据集注册表可再附加） */
const GLOBAL_SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'phone',
  'email'
]

export interface DataQueryDataset {
  code: string
  label: string
  allowedTables: string[]
  requiredPermission?: string
  sensitiveFields: string[]
  description?: string
}

export interface DataQueryAuth {
  /** 登录用户 ID（token / PermissionsGuard 注入） */
  uid?: string
  /** 权限码快照（guard 已增强时不再重复查询 RBAC，仅审计留档） */
  permissions?: string[]
}

export interface DataQueryOptions {
  question: string
  conversationId?: string
  auth?: DataQueryAuth
  onProgress?: (text: string) => void
}

export interface DataQueryOutcome {
  /** 可直接落库的助手消息（type='table' 表格或 text 文案） */
  reply: Omit<AiMessage, 'id' | 'createdAt'>
  /** 审计记录 ID（写库失败时省略） */
  sqlAuditId?: string
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

/** 单元格值规整：bigint/Decimal/Buffer/Date → JSON 可安全传输的值 */
function toCellValue(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value
  if (value instanceof Date)
    return value.toISOString().replace('T', ' ').slice(0, 19)
  if (typeof value === 'object') return value.toString()
  return String(value)
}

@Injectable()
export class AiAssistantDataQueryService {
  /** 限流滑动窗口：每用户分钟/天时间戳桶 */
  private readonly rateBucket = new Map<
    string,
    { minute: number[]; day: number[] }
  >()

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly llm: AiAssistantLlmService
  ) {}

  /** 对话链路预判：问数意图命中时走数据问数管道而非普通闲聊 */
  isQueryIntent(text: string): boolean {
    if (!text) return false
    return QUERY_INTENT_RE.test(text.trim())
  }

  /**
   * 问数主流程（不做意图判断，由调用方决定）。
   * 任何分支都会写审计记录，且永远返回可落库的助手回复（不抛业务异常）。
   */
  async run(opts: DataQueryOptions): Promise<DataQueryOutcome> {
    const startedAt = Date.now()
    const question = (opts.question || '').trim().slice(0, 500)
    const progress = opts.onProgress ?? ((): void => {})
    const uid = Number(opts.auth?.uid ?? 0)
    const uidValid = Number.isInteger(uid) && uid > 0
    const userName = uidValid ? await this.resolveUserName(uid) : 'guest'
    let permissionSnapshot: string[] = []

    const mkReply = (
      content: string,
      type: AiMessage['type'] = 'text',
      payload?: Record<string, unknown>
    ): Omit<AiMessage, 'id' | 'createdAt'> => ({
      conversationId: opts.conversationId || '',
      role: 'assistant',
      type,
      content,
      ...(payload ? { payload } : {}),
      capabilityId: 'data-query'
    })

    const finish = async (result: {
      status: 'success' | 'denied' | 'rejected' | 'timeout' | 'fail'
      errorCode?: string
      datasetCode?: string
      generatedSql?: string
      rows?: number
      reply: Omit<AiMessage, 'id' | 'createdAt'>
    }): Promise<DataQueryOutcome> => {
      let sqlAuditId: string | undefined
      try {
        const created = await this.prisma.client.aiQueryAudit.create({
          data: {
            userId: BigInt(uidValid ? uid : 0),
            userName,
            permissionCodes:
              permissionSnapshot as unknown as Prisma.InputJsonValue,
            conversationId: opts.conversationId ?? null,
            question,
            datasetCode: (result.datasetCode ?? 'none').slice(0, 32),
            generatedSql: result.generatedSql ?? null,
            status: result.status,
            errorCode: result.errorCode ?? null,
            rows: result.rows ?? 0,
            durationMs: Date.now() - startedAt
          }
        })
        sqlAuditId = created.id.toString()
      } catch (error) {
        console.error('[ai-assistant] 审计写入失败:', error)
      }
      return { reply: result.reply, sqlAuditId }
    }

    if (!question) {
      return finish({
        status: 'rejected',
        errorCode: 'NL2SQL_REJECTED',
        reply: mkReply('问题内容为空，无法查询数据。')
      })
    }

    progress('正在校验数据问数权限…')

    // ---- 第一层：登录态 + 问数功能权限码 ----
    if (!uidValid) {
      return finish({
        status: 'denied',
        errorCode: 'QUERY_NOT_LOGGED_IN',
        reply: mkReply('尚未登录，无法使用数据问数。请先登录后再试。')
      })
    }

    if (opts.auth?.permissions?.length) {
      permissionSnapshot = [...opts.auth.permissions]
    } else {
      try {
        permissionSnapshot =
          (await this.rbac.getUserRoleAndPermissions(uid)).permissions ?? []
      } catch {
        permissionSnapshot = []
      }
    }

    if (!permissionSnapshot.includes(AI_QUERY_PERMISSION)) {
      return finish({
        status: 'denied',
        errorCode: 'QUERY_PERM_DENIED',
        reply: mkReply('你没有「AI 数据问数」权限，如需使用请联系管理员开通。')
      })
    }

    // ---- 限流（每分钟 10 次 / 每天 200 次） ----
    if (!this.checkRate(`ai-query:u${uid}`)) {
      return finish({
        status: 'denied',
        errorCode: 'RATE_LIMITED',
        reply: mkReply(
          '查询请求过于频繁（限每分钟 10 次、每天 200 次），请稍后再试。'
        )
      })
    }

    // ---- 第二层：数据集注册表（enabled + 业务权限码） ----
    progress('正在检索可用数据集…')
    let datasets: DataQueryDataset[] = []
    try {
      datasets = await this.loadAccessibleDatasets(permissionSnapshot)
    } catch (error) {
      console.error('[ai-assistant] 数据集注册表读取失败:', error)
    }
    if (!datasets.length) {
      return finish({
        status: 'rejected',
        errorCode: 'QUERY_DATASET_NOT_FOUND',
        reply: mkReply(
          '当前没有可查询的数据集权限。数据问数需要对应业务数据的查看权限（如积分、任务、流程编排等），请联系管理员开通。'
        )
      })
    }

    // ---- NL2SQL：仅按白名单数据字典生成 ----
    progress('正在生成查询 SQL…')
    const tableDict = this.buildTableDict(datasets)
    const generated = await this.llm.generateSql(question, tableDict)
    if (!generated || /^SELECT\s+'CANNOT_ANSWER'/i.test(generated)) {
      return finish({
        status: 'rejected',
        errorCode: 'NL2SQL_REJECTED',
        generatedSql: generated || undefined,
        reply: mkReply(
          '暂无法将该问题转换为符合安全规范的数据库查询。建议换个更明确的问法（例如：统计最近 7 天积分发放量），或确认 AI 大模型服务已正确配置。'
        )
      })
    }

    // ---- 词法安全校验（八条基线，PRD 4.5.4） ----
    const validated = this.validateSql(generated, datasets)
    if (!validated.ok) {
      console.warn('[ai-assistant] SQL 校验未通过:', validated.reason)
      return finish({
        status: 'rejected',
        errorCode: 'NL2SQL_REJECTED',
        generatedSql: generated,
        reply: mkReply(
          '生成的查询语句未通过安全校验，已拦截本次请求。建议缩小查询范围或换个问法后重试。'
        )
      })
    }

    // ---- 只读执行（5s 超时） ----
    progress('正在执行只读查询…')
    const datasetCode = validated.usedDatasets
      .map(d => d.code)
      .join('+')
      .slice(0, 32)
    const datasetLabels = [
      ...new Set(validated.usedDatasets.map(d => d.label))
    ].join('、')

    let result: Record<string, unknown>[] = []
    try {
      result = await this.executeReadonly(validated.sql)
    } catch (error) {
      if (error instanceof Error && error.message === QUERY_TIMEOUT_MESSAGE) {
        return finish({
          status: 'timeout',
          errorCode: 'QUERY_TIMEOUT',
          datasetCode,
          generatedSql: validated.sql,
          rows: 0,
          reply: mkReply(
            '查询超时（只读查询上限 5 秒）。请缩小时间范围或简化问题后重试。'
          )
        })
      }
      console.error('[ai-assistant] SQL 执行失败:', error)
      return finish({
        status: 'fail',
        errorCode: 'QUERY_DB_ERROR',
        datasetCode,
        generatedSql: validated.sql,
        rows: 0,
        reply: mkReply('查询执行失败，请稍后重试或换个问法。')
      })
    }

    return finish({
      status: 'success',
      datasetCode,
      generatedSql: validated.sql,
      rows: result.length,
      reply: this.buildResultReply(
        opts.conversationId,
        question,
        datasetLabels,
        result
      )
    })
  }

  // ---------- 内部实现 ----------

  private async resolveUserName(uid: number): Promise<string> {
    try {
      const user = await this.prisma.client.user.findUnique({
        where: { id: BigInt(uid) },
        select: { name: true }
      })
      return user?.name ? user.name.slice(0, 64) : `user-${uid}`
    } catch {
      return `user-${uid}`
    }
  }

  private checkRate(key: string): boolean {
    const now = Date.now()
    const bucket = this.rateBucket.get(key) ?? { minute: [], day: [] }
    bucket.minute = bucket.minute.filter(t => now - t < 60_000)
    bucket.day = bucket.day.filter(t => now - t < 86_400_000)
    if (
      bucket.minute.length >= RATE_LIMIT_PER_MINUTE ||
      bucket.day.length >= RATE_LIMIT_PER_DAY
    ) {
      this.rateBucket.set(key, bucket)
      return false
    }
    bucket.minute.push(now)
    bucket.day.push(now)
    this.rateBucket.set(key, bucket)
    return true
  }

  /** 启用中、且用户拥有第二层业务权限码的数据集 */
  private async loadAccessibleDatasets(
    permissions: string[]
  ): Promise<DataQueryDataset[]> {
    const rows = await this.prisma.client.aiDatasetRegistry.findMany({
      where: { enabled: true },
      orderBy: { code: 'asc' }
    })
    return rows
      .map(row => ({
        code: row.code,
        label: row.label,
        allowedTables: parseStringArray(row.allowedTables),
        requiredPermission: row.requiredPermission ?? undefined,
        sensitiveFields: parseStringArray(row.sensitiveFields),
        description: row.description ?? undefined
      }))
      .filter(
        ds =>
          !ds.requiredPermission || permissions.includes(ds.requiredPermission)
      )
  }

  private buildTableDict(datasets: DataQueryDataset[]): string {
    return datasets
      .map(
        ds =>
          `【数据集：${ds.label}（code=${ds.code}）】\n${ds.description ?? ''}`
      )
      .join('\n\n')
  }

  /** 剥掉 LLM 可能违规输出的 Markdown 代码块与结尾分号 */
  private normalizeSql(raw: string): string {
    let sql = raw.trim()
    const fence = sql.match(/^```(?:sql|mysql)?\s*([\s\S]*?)\s*```$/i)
    if (fence) sql = fence[1].trim()
    return sql.replace(/;\s*$/, '').trim()
  }

  /** 提取 FROM/JOIN 后实际引用的表名（小写） */
  private extractReferencedTables(sql: string): string[] {
    const tables = new Set<string>()
    const re = /\b(?:from|join)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(sql)) !== null) {
      const name = match[1].toLowerCase()
      if (name === 'select' || name === 'dual') continue
      tables.add(name)
    }
    return [...tables]
  }

  /**
   * 词法安全校验（PRD 4.5.4 八条基线）：
   * SELECT/WITH 开头、无分号注释、无危险语句、表白名单（含 JOIN 双表）、
   * 敏感字段拦截、强制 LIMIT 200。
   */
  private validateSql(
    raw: string,
    datasets: DataQueryDataset[]
  ):
    | { ok: true; sql: string; usedDatasets: DataQueryDataset[] }
    | { ok: false; reason: string } {
    const sql = this.normalizeSql(raw)
    if (!sql) return { ok: false, reason: 'empty' }
    if (!/^(select|with)\b/i.test(sql)) {
      return { ok: false, reason: 'not-select' }
    }
    if (sql.includes(';')) return { ok: false, reason: 'semicolon' }
    if (/(--[^\n]*|#[^\n]*|\/\*)/.test(sql)) {
      return { ok: false, reason: 'comment' }
    }
    if (FORBIDDEN_SQL_RE.test(sql)) {
      return { ok: false, reason: 'dangerous-keyword' }
    }

    const tables = this.extractReferencedTables(sql)
    if (!tables.length) return { ok: false, reason: 'no-table' }

    const usedDatasets = datasets.filter(ds =>
      tables.some(t => ds.allowedTables.map(x => x.toLowerCase()).includes(t))
    )
    const covered = new Set(
      usedDatasets.flatMap(ds => ds.allowedTables.map(x => x.toLowerCase()))
    )
    for (const t of tables) {
      if (!covered.has(t)) {
        return { ok: false, reason: `table-not-allowed:${t}` }
      }
    }

    const sensitiveFields = [
      ...new Set([
        ...GLOBAL_SENSITIVE_FIELDS,
        ...usedDatasets.flatMap(ds => ds.sensitiveFields)
      ])
    ]
    for (const field of sensitiveFields) {
      if (new RegExp(`\\b${field}\\b`, 'i').test(sql)) {
        return { ok: false, reason: `sensitive-field:${field}` }
      }
    }

    // 强制 LIMIT 200：移除尾部原有 LIMIT（含 LIMIT n,m / OFFSET），统一重写
    let finalSql = sql
      .replace(/\s+limit\s+(?:\d+\s*,\s*)?\d+(?:\s+offset\s+\d+)?\s*$/i, '')
      .trim()
    finalSql = `${finalSql} LIMIT ${MAX_QUERY_ROWS}`
    return { ok: true, sql: finalSql, usedDatasets }
  }

  /** 只读执行 + 5s 超时（超时后底层连接自然结束，不做二次 LLM 兜底） */
  private async executeReadonly(
    sql: string
  ): Promise<Record<string, unknown>[]> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(QUERY_TIMEOUT_MESSAGE)),
        QUERY_TIMEOUT_MS
      )
    })
    return Promise.race([rawQuery<Record<string, unknown>>(sql), timeout])
  }

  /** 表格回复构造（前端契约：payload.columns=[{prop,label}] rows=[{...}]） */
  private buildResultReply(
    conversationId: string | undefined,
    question: string,
    datasetLabels: string,
    result: Record<string, unknown>[]
  ): Omit<AiMessage, 'id' | 'createdAt'> {
    const rows = result.slice(0, MAX_QUERY_ROWS).map(row => {
      const clean: Record<string, string | number | boolean | null> = {}
      for (const [key, value] of Object.entries(row)) {
        clean[key] = toCellValue(value)
      }
      return clean
    })

    const base = {
      conversationId: conversationId || '',
      role: 'assistant' as const,
      capabilityId: 'data-query'
    }

    if (!rows.length) {
      return {
        ...base,
        type: 'text' as const,
        content: `未查询到符合条件的数据（${question}）。`
      }
    }

    const columns = Object.keys(rows[0]).map(key => ({
      prop: key,
      label: key
    }))
    return {
      ...base,
      type: 'table' as const,
      content: `已为你查询到 ${rows.length} 行「${datasetLabels}」数据${result.length > MAX_QUERY_ROWS ? `（结果较多，仅展示前 ${MAX_QUERY_ROWS} 行，可缩小时间范围后继续追问）` : ''}：`,
      payload: { columns, rows }
    }
  }
}
