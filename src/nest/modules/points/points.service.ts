import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

type AuthInfo = { uid?: string | number; userId?: string | number }

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  resolveUserId(
    auth?: AuthInfo,
    queryUserId?: string | number,
    bodyUserId?: string | number
  ): number {
    if (auth?.uid != null && auth.uid !== '') {
      const n = Number(auth.uid)
      if (Number.isFinite(n) && n > 0) return n
    }
    if (auth?.userId != null && auth.userId !== '') {
      const n = Number(auth.userId)
      if (Number.isFinite(n) && n > 0) return n
    }
    if (bodyUserId != null && bodyUserId !== '') {
      const n = Number(bodyUserId)
      if (Number.isFinite(n) && n > 0) return n
    }
    if (queryUserId != null && queryUserId !== '') {
      const n = Number(queryUserId)
      if (Number.isFinite(n) && n > 0) return n
    }
    throw new BadRequestException('缺少用户ID')
  }

  private toIso(d?: Date | null) {
    return d ? d.toISOString() : undefined
  }

  private todayDateOnly(): Date {
    const now = new Date()
    // 使用本地日历日的 UTC 零点，避免 @db.Date 因时区偏移写成前一天，
    // 导致 findUnique 查不到、create 却触发唯一约束而误报「今日已签到」
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  private formatDateKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  private formatMonthKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  private genTransactionNo(): string {
    const now = new Date()
    const pad = (n: number, len = 2) => String(n).padStart(len, '0')
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const rand = pad(Math.floor(Math.random() * 10000), 4)
    return `PT${stamp}${rand}`
  }

  private async getNextLevelPoints(totalEarned: number, currentLevel: number) {
    const next = await this.prisma.client.pointsLevel.findFirst({
      where: { level: { gt: currentLevel } },
      orderBy: { level: 'asc' }
    })
    if (next) return next.requiredPoints
    const current = await this.prisma.client.pointsLevel.findFirst({
      where: { level: currentLevel }
    })
    return current?.requiredPoints ?? totalEarned
  }

  private mapAccount(
    account: {
      id: bigint
      userId: bigint
      pointsType: string
      availablePoints: number
      frozenPoints: number
      totalEarned: number
      totalSpent: number
      level: number
      levelName: string
      status: string
      createdAt: Date
      updatedAt: Date
    },
    nextLevelPoints: number
  ) {
    return {
      id: Number(account.id),
      userId: Number(account.userId),
      availablePoints: account.availablePoints,
      frozenPoints: account.frozenPoints,
      totalEarned: account.totalEarned,
      totalSpent: account.totalSpent,
      pointsType: account.pointsType,
      level: account.level,
      levelName: account.levelName,
      nextLevelPoints,
      status: account.status,
      createdAt: this.toIso(account.createdAt),
      updatedAt: this.toIso(account.updatedAt)
    }
  }

  async getOrCreateAccount(userId: number, pointsType = 'GENERAL') {
    const existing = await this.prisma.client.pointsAccount.findUnique({
      where: {
        userId_pointsType: {
          userId: BigInt(userId),
          pointsType
        }
      }
    })
    if (existing) return existing

    const level1 = await this.prisma.client.pointsLevel.findFirst({
      where: { level: 1 }
    })

    try {
      return await this.prisma.client.pointsAccount.create({
        data: {
          userId: BigInt(userId),
          pointsType,
          availablePoints: 0,
          frozenPoints: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: level1?.level ?? 1,
          levelName: level1?.name ?? '普通会员',
          status: 'ACTIVE'
        }
      })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const again = await this.prisma.client.pointsAccount.findUnique({
          where: {
            userId_pointsType: {
              userId: BigInt(userId),
              pointsType
            }
          }
        })
        if (again) return again
      }
      throw e
    }
  }

  async getAccount(userId: number, pointsType = 'GENERAL') {
    const account = await this.getOrCreateAccount(userId, pointsType)
    const nextLevelPoints = await this.getNextLevelPoints(
      account.totalEarned,
      account.level
    )
    return this.mapAccount(account, nextLevelPoints)
  }

  async getTransactions(params: {
    userId: number
    accountId?: number
    type?: string
    source?: string
    startTime?: string
    endTime?: string
    page?: number
    pageSize?: number
  }) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    const where: Prisma.PointsTransactionWhereInput = {
      userId: BigInt(params.userId)
    }
    if (params.accountId) where.accountId = BigInt(params.accountId)
    if (params.type) where.type = params.type
    if (params.source) where.source = params.source
    if (params.startTime || params.endTime) {
      where.createdAt = {}
      if (params.startTime) where.createdAt.gte = new Date(params.startTime)
      if (params.endTime) where.createdAt.lte = new Date(params.endTime)
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.pointsTransaction.count({ where }),
      this.prisma.client.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return {
      list: rows.map(row => this.mapTransaction(row)),
      total
    }
  }

  private mapTransaction(row: {
    id: bigint
    transactionNo: string
    userId: bigint
    accountId: bigint
    type: string
    points: number
    balanceBefore: number
    balanceAfter: number
    source: string
    referenceId: string | null
    referenceType: string | null
    description: string
    expireAt: Date | null
    status: string
    extraData: Prisma.JsonValue | null
    createdAt: Date
  }) {
    const extra =
      row.extraData &&
      typeof row.extraData === 'object' &&
      !Array.isArray(row.extraData)
        ? (row.extraData as Record<string, unknown>)
        : {}
    return {
      id: Number(row.id),
      transactionNo: row.transactionNo,
      userId: Number(row.userId),
      accountId: Number(row.accountId),
      type: row.type,
      points: row.points,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      source: row.source,
      referenceId: row.referenceId || undefined,
      referenceType: row.referenceType || undefined,
      description: row.description,
      expireAt: this.toIso(row.expireAt),
      status: row.status,
      operatorId:
        extra.operatorId != null ? Number(extra.operatorId) : undefined,
      operatorName:
        typeof extra.operatorName === 'string' ? extra.operatorName : undefined,
      createdAt: this.toIso(row.createdAt)
    }
  }

  /** 解析操作人展示名 */
  async resolveOperatorName(operatorId: number): Promise<string> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: BigInt(operatorId), deletedAt: null },
      select: { name: true, accountAlias: true, phone: true }
    })
    if (!user) return `用户#${operatorId}`
    return (
      user.name?.trim() ||
      user.accountAlias?.trim() ||
      user.phone?.trim() ||
      `用户#${operatorId}`
    )
  }

  /**
   * 管理员给用户新增积分（必须写明原因，并记录操作人）
   */
  async adminGrantPoints(input: {
    userId: number
    points: number
    reason: string
    operatorId: number
    operatorName?: string
  }) {
    const points = Number(input.points)
    if (!Number.isFinite(points) || points <= 0) {
      throw new BadRequestException('新增积分必须为正整数')
    }
    const reason = String(input.reason || '').trim()
    if (!reason) {
      throw new BadRequestException('请填写新增原因')
    }
    if (!Number.isFinite(input.userId) || input.userId <= 0) {
      throw new BadRequestException('请指定目标用户')
    }
    if (!Number.isFinite(input.operatorId) || input.operatorId <= 0) {
      throw new BadRequestException('缺少操作人信息')
    }

    const target = await this.prisma.client.user.findFirst({
      where: { id: BigInt(input.userId), deletedAt: null },
      select: { id: true }
    })
    if (!target) {
      throw new BadRequestException('目标用户不存在')
    }

    const operatorName =
      input.operatorName?.trim() ||
      (await this.resolveOperatorName(input.operatorId))

    return this.operatePoints({
      userId: input.userId,
      points: Math.floor(points),
      source: 'ADMIN_ADJUST',
      referenceId: String(input.operatorId),
      referenceType: 'ADMIN',
      description: reason,
      immediate: true,
      transactionType: 'ADJUST',
      operatorId: input.operatorId,
      operatorName,
      skipRuleLimit: true
    })
  }

  /** 管理端查询积分流水（可指定用户，不强制当前登录用户） */
  async getAdminTransactions(params: {
    userId?: number
    source?: string
    type?: string
    page?: number
    pageSize?: number
  }) {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    const where: Prisma.PointsTransactionWhereInput = {}
    if (params.userId) where.userId = BigInt(params.userId)
    if (params.source) where.source = params.source
    if (params.type) where.type = params.type

    const [total, rows] = await Promise.all([
      this.prisma.client.pointsTransaction.count({ where }),
      this.prisma.client.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return {
      list: rows.map(row => this.mapTransaction(row)),
      total
    }
  }

  async getRules(params?: {
    source?: string
    pointsType?: string
    enabled?: string | boolean
  }) {
    const where: Prisma.PointsRuleWhereInput = {}
    if (params?.source) where.source = params.source
    if (params?.pointsType) where.pointsType = params.pointsType
    if (params?.enabled !== undefined && params.enabled !== '') {
      const enabled =
        params.enabled === true ||
        params.enabled === 'true' ||
        params.enabled === '1'
      where.enabled = enabled ? 1 : 0
    }

    const rows = await this.prisma.client.pointsRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { id: 'asc' }]
    })

    return rows.map(row => this.mapRule(row))
  }

  async getLevels() {
    const rows = await this.prisma.client.pointsLevel.findMany({
      orderBy: { level: 'asc' }
    })
    return rows.map(row => ({
      id: Number(row.id),
      level: row.level,
      name: row.name,
      icon: row.icon || undefined,
      requiredPoints: row.requiredPoints,
      benefits: (row.benefits as Record<string, unknown>) || {},
      description: row.description || '',
      sortOrder: row.sortOrder
    }))
  }

  private mapRule(row: {
    id: bigint
    name: string
    code: string
    source: string
    pointsType: string
    pointsValue:
      | { toNumber?: () => number }
      | number
      | { toString: () => string }
    calcMethod: string
    dailyLimit: number
    monthlyLimit: number
    singleLimit: number
    validDays: number
    description: string | null
    enabled: number
    priority: number
    startTime: Date | null
    endTime: Date | null
    extraConfig: unknown
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      code: row.code,
      source: row.source,
      pointsType: row.pointsType,
      pointsValue: Number(row.pointsValue),
      calcMethod: row.calcMethod,
      dailyLimit: row.dailyLimit,
      monthlyLimit: row.monthlyLimit,
      singleLimit: row.singleLimit,
      validDays: row.validDays,
      description: row.description || '',
      enabled: row.enabled === 1,
      priority: row.priority,
      startTime: this.toIso(row.startTime),
      endTime: this.toIso(row.endTime),
      extraConfig: (row.extraConfig as Record<string, unknown>) || undefined
    }
  }

  async createRule(body: {
    name: string
    code: string
    source: string
    pointsType?: string
    pointsValue: number
    calcMethod?: string
    dailyLimit?: number
    monthlyLimit?: number
    singleLimit?: number
    validDays?: number
    description?: string
    enabled?: boolean | number
    priority?: number
    startTime?: string | null
    endTime?: string | null
    extraConfig?: Record<string, unknown>
  }) {
    if (!body.name || !body.code || !body.source) {
      throw new BadRequestException('名称、编码、来源不能为空')
    }
    if (body.pointsValue === undefined || body.pointsValue === null) {
      throw new BadRequestException('积分值不能为空')
    }
    const exists = await this.prisma.client.pointsRule.findUnique({
      where: { code: body.code }
    })
    if (exists) throw new BadRequestException('规则编码已存在')

    const row = await this.prisma.client.pointsRule.create({
      data: {
        name: body.name,
        code: body.code,
        source: body.source,
        pointsType: body.pointsType || 'GENERAL',
        pointsValue: body.pointsValue,
        calcMethod: body.calcMethod || 'FIXED',
        dailyLimit: body.dailyLimit ?? 0,
        monthlyLimit: body.monthlyLimit ?? 0,
        singleLimit: body.singleLimit ?? 0,
        validDays: body.validDays ?? 365,
        description: body.description || null,
        enabled: body.enabled === false || body.enabled === 0 ? 0 : 1,
        priority: body.priority ?? 0,
        startTime: body.startTime ? new Date(body.startTime) : null,
        endTime: body.endTime ? new Date(body.endTime) : null,
        extraConfig: body.extraConfig
          ? (body.extraConfig as Prisma.InputJsonValue)
          : undefined
      }
    })
    return this.mapRule(row)
  }

  async updateRule(body: {
    id: number
    name?: string
    code?: string
    source?: string
    pointsType?: string
    pointsValue?: number
    calcMethod?: string
    dailyLimit?: number
    monthlyLimit?: number
    singleLimit?: number
    validDays?: number
    description?: string
    enabled?: boolean | number
    priority?: number
    startTime?: string | null
    endTime?: string | null
    extraConfig?: Record<string, unknown>
  }) {
    if (!body.id) throw new BadRequestException('缺少规则 id')
    if (body.code) {
      const dup = await this.prisma.client.pointsRule.findFirst({
        where: { code: body.code, NOT: { id: BigInt(body.id) } }
      })
      if (dup) throw new BadRequestException('规则编码已存在')
    }

    const data: Prisma.PointsRuleUpdateInput = {}
    if (body.name !== undefined) data.name = body.name
    if (body.code !== undefined) data.code = body.code
    if (body.source !== undefined) data.source = body.source
    if (body.pointsType !== undefined) data.pointsType = body.pointsType
    if (body.pointsValue !== undefined) data.pointsValue = body.pointsValue
    if (body.calcMethod !== undefined) data.calcMethod = body.calcMethod
    if (body.dailyLimit !== undefined) data.dailyLimit = body.dailyLimit
    if (body.monthlyLimit !== undefined) data.monthlyLimit = body.monthlyLimit
    if (body.singleLimit !== undefined) data.singleLimit = body.singleLimit
    if (body.validDays !== undefined) data.validDays = body.validDays
    if (body.description !== undefined) data.description = body.description
    if (body.enabled !== undefined) {
      data.enabled = body.enabled === false || body.enabled === 0 ? 0 : 1
    }
    if (body.priority !== undefined) data.priority = body.priority
    if (body.startTime !== undefined) {
      data.startTime = body.startTime ? new Date(body.startTime) : null
    }
    if (body.endTime !== undefined) {
      data.endTime = body.endTime ? new Date(body.endTime) : null
    }
    if (body.extraConfig !== undefined) {
      data.extraConfig = body.extraConfig as Prisma.InputJsonValue
    }

    const row = await this.prisma.client.pointsRule.update({
      where: { id: BigInt(body.id) },
      data
    })
    return this.mapRule(row)
  }

  async deleteRule(id: number) {
    if (!id) throw new BadRequestException('缺少规则 id')
    await this.prisma.client.pointsRule.delete({ where: { id: BigInt(id) } })
    return true
  }

  async createLevel(body: {
    level: number
    name: string
    icon?: string
    requiredPoints: number
    benefits?: Record<string, unknown>
    description?: string
    sortOrder?: number
  }) {
    if (body.level == null || !body.name) {
      throw new BadRequestException('等级和名称不能为空')
    }
    if (body.requiredPoints == null) {
      throw new BadRequestException('所需积分不能为空')
    }
    const exists = await this.prisma.client.pointsLevel.findUnique({
      where: { level: Number(body.level) }
    })
    if (exists) throw new BadRequestException('等级已存在')

    const row = await this.prisma.client.pointsLevel.create({
      data: {
        level: Number(body.level),
        name: body.name,
        icon: body.icon || null,
        requiredPoints: Number(body.requiredPoints),
        benefits: body.benefits ? (body.benefits as Prisma.InputJsonValue) : {},
        description: body.description || null,
        sortOrder: body.sortOrder ?? Number(body.level)
      }
    })
    return {
      id: Number(row.id),
      level: row.level,
      name: row.name,
      icon: row.icon || undefined,
      requiredPoints: row.requiredPoints,
      benefits: (row.benefits as Record<string, unknown>) || {},
      description: row.description || '',
      sortOrder: row.sortOrder
    }
  }

  async updateLevel(body: {
    id: number
    level?: number
    name?: string
    icon?: string
    requiredPoints?: number
    benefits?: Record<string, unknown>
    description?: string
    sortOrder?: number
  }) {
    if (!body.id) throw new BadRequestException('缺少等级 id')
    if (body.level != null) {
      const dup = await this.prisma.client.pointsLevel.findFirst({
        where: { level: Number(body.level), NOT: { id: BigInt(body.id) } }
      })
      if (dup) throw new BadRequestException('等级已存在')
    }

    const data: Prisma.PointsLevelUpdateInput = {}
    if (body.level !== undefined) data.level = Number(body.level)
    if (body.name !== undefined) data.name = body.name
    if (body.icon !== undefined) data.icon = body.icon || null
    if (body.requiredPoints !== undefined) {
      data.requiredPoints = Number(body.requiredPoints)
    }
    if (body.benefits !== undefined) {
      data.benefits = body.benefits as Prisma.InputJsonValue
    }
    if (body.description !== undefined) data.description = body.description
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder

    const row = await this.prisma.client.pointsLevel.update({
      where: { id: BigInt(body.id) },
      data
    })
    return {
      id: Number(row.id),
      level: row.level,
      name: row.name,
      icon: row.icon || undefined,
      requiredPoints: row.requiredPoints,
      benefits: (row.benefits as Record<string, unknown>) || {},
      description: row.description || '',
      sortOrder: row.sortOrder
    }
  }

  async deleteLevel(id: number) {
    if (!id) throw new BadRequestException('缺少等级 id')
    await this.prisma.client.pointsLevel.delete({ where: { id: BigInt(id) } })
    return true
  }

  async getStatistics(userId: number) {
    const now = new Date()
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const expiringDays = 30
    const expireBefore = new Date(
      now.getTime() + expiringDays * 24 * 60 * 60 * 1000
    )

    const uid = BigInt(userId)
    const base = { userId: uid, status: 'COMPLETED' as const }

    const [
      todayEarnAgg,
      todaySpendAgg,
      monthEarnAgg,
      yearEarnAgg,
      expiringAgg
    ] = await Promise.all([
      this.prisma.client.pointsTransaction.aggregate({
        where: { ...base, points: { gt: 0 }, createdAt: { gte: startOfDay } },
        _sum: { points: true }
      }),
      this.prisma.client.pointsTransaction.aggregate({
        where: { ...base, points: { lt: 0 }, createdAt: { gte: startOfDay } },
        _sum: { points: true }
      }),
      this.prisma.client.pointsTransaction.aggregate({
        where: { ...base, points: { gt: 0 }, createdAt: { gte: startOfMonth } },
        _sum: { points: true }
      }),
      this.prisma.client.pointsTransaction.aggregate({
        where: { ...base, points: { gt: 0 }, createdAt: { gte: startOfYear } },
        _sum: { points: true }
      }),
      this.prisma.client.pointsTransaction.aggregate({
        where: {
          ...base,
          points: { gt: 0 },
          expireAt: { gte: now, lte: expireBefore }
        },
        _sum: { points: true }
      })
    ])

    return {
      todayEarned: todayEarnAgg._sum.points || 0,
      monthEarned: monthEarnAgg._sum.points || 0,
      yearEarned: yearEarnAgg._sum.points || 0,
      todaySpent: Math.abs(todaySpendAgg._sum.points || 0),
      expiringPoints: expiringAgg._sum.points || 0,
      expiringDays
    }
  }

  private async assertRuleLimit(
    tx: Prisma.TransactionClient,
    userId: number,
    rule: {
      code: string
      dailyLimit: number
      monthlyLimit: number
      singleLimit: number
    },
    points: number
  ) {
    if (rule.singleLimit > 0 && Math.abs(points) > rule.singleLimit) {
      throw new BadRequestException('超过单次积分上限')
    }

    const now = new Date()
    if (rule.dailyLimit > 0) {
      const dailyKey = this.formatDateKey(now)
      const daily = await tx.pointsUserLimit.findUnique({
        where: {
          userId_ruleCode_periodType_periodKey: {
            userId: BigInt(userId),
            ruleCode: rule.code,
            periodType: 'DAILY',
            periodKey: dailyKey
          }
        }
      })
      if (daily && daily.count >= rule.dailyLimit) {
        throw new BadRequestException('已达每日积分上限')
      }
    }

    if (rule.monthlyLimit > 0) {
      const monthKey = this.formatMonthKey(now)
      const monthly = await tx.pointsUserLimit.findUnique({
        where: {
          userId_ruleCode_periodType_periodKey: {
            userId: BigInt(userId),
            ruleCode: rule.code,
            periodType: 'MONTHLY',
            periodKey: monthKey
          }
        }
      })
      if (monthly && monthly.count >= rule.monthlyLimit) {
        throw new BadRequestException('已达每月积分上限')
      }
    }
  }

  private async bumpRuleLimit(
    tx: Prisma.TransactionClient,
    userId: number,
    ruleCode: string,
    points: number
  ) {
    const now = new Date()
    const periods = [
      { periodType: 'DAILY', periodKey: this.formatDateKey(now) },
      { periodType: 'MONTHLY', periodKey: this.formatMonthKey(now) }
    ]

    for (const p of periods) {
      await tx.pointsUserLimit.upsert({
        where: {
          userId_ruleCode_periodType_periodKey: {
            userId: BigInt(userId),
            ruleCode,
            periodType: p.periodType,
            periodKey: p.periodKey
          }
        },
        create: {
          userId: BigInt(userId),
          ruleCode,
          periodType: p.periodType,
          periodKey: p.periodKey,
          count: 1,
          points: Math.abs(points)
        },
        update: {
          count: { increment: 1 },
          points: { increment: Math.abs(points) }
        }
      })
    }
  }

  private async refreshLevel(
    tx: Prisma.TransactionClient,
    accountId: bigint,
    totalEarned: number
  ) {
    const level = await tx.pointsLevel.findFirst({
      where: { requiredPoints: { lte: totalEarned } },
      orderBy: { requiredPoints: 'desc' }
    })
    if (!level) return
    await tx.pointsAccount.update({
      where: { id: accountId },
      data: {
        level: level.level,
        levelName: level.name
      }
    })
  }

  async operatePoints(input: {
    userId: number
    points: number
    source: string
    referenceId?: string
    referenceType?: string
    description: string
    immediate?: boolean
    extra?: Record<string, unknown>
    ruleCode?: string
    /** 强制交易类型（如管理员调整用 ADJUST） */
    transactionType?: string
    operatorId?: number
    operatorName?: string
    /** 跳过规则限额校验（管理员手动发放） */
    skipRuleLimit?: boolean
  }) {
    const points = Number(input.points)
    if (!Number.isFinite(points) || points === 0) {
      throw new BadRequestException('积分值不能为0')
    }
    if (!input.source) {
      throw new BadRequestException('缺少积分来源')
    }
    if (!input.description) {
      throw new BadRequestException('缺少交易描述')
    }

    const immediate = input.immediate !== false
    const transactionType =
      input.transactionType ||
      (points > 0 ? 'EARN' : points < 0 ? 'SPEND' : 'ADJUST')

    const result = await this.prisma.client.$transaction(async tx => {
      const locked = await tx.$queryRaw<
        Array<{
          id: bigint
          available_points: number
          frozen_points: number
          total_earned: number
          total_spent: number
          status: string
        }>
      >`
        SELECT id, available_points, frozen_points, total_earned, total_spent, status
        FROM points_account
        WHERE user_id = ${BigInt(input.userId)} AND points_type = 'GENERAL'
        FOR UPDATE
      `

      let accountId: bigint
      let available = 0
      let totalEarned = 0

      if (!locked.length) {
        const created = await tx.pointsAccount.create({
          data: {
            userId: BigInt(input.userId),
            pointsType: 'GENERAL',
            availablePoints: 0,
            frozenPoints: 0,
            totalEarned: 0,
            totalSpent: 0,
            level: 1,
            levelName: '普通会员',
            status: 'ACTIVE'
          }
        })
        accountId = created.id
      } else {
        if (locked[0].status !== 'ACTIVE') {
          throw new BadRequestException('积分账户不可用')
        }
        accountId = locked[0].id
        available = locked[0].available_points
        totalEarned = locked[0].total_earned
      }

      const rule = input.ruleCode
        ? await tx.pointsRule.findUnique({ where: { code: input.ruleCode } })
        : await tx.pointsRule.findFirst({
            where: { source: input.source, enabled: 1 },
            orderBy: { priority: 'desc' }
          })

      if (rule && points > 0 && !input.skipRuleLimit) {
        await this.assertRuleLimit(tx, input.userId, rule, points)
      }

      if (points < 0 && available < Math.abs(points)) {
        throw new BadRequestException('积分不足')
      }

      let validDays = rule?.validDays ?? 365
      let expireAt: Date | null = null
      if (points > 0 && validDays > 0) {
        expireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
      }

      const status = immediate ? 'COMPLETED' : 'PENDING'
      const balanceAfter = immediate ? available + points : available
      const transactionNo = this.genTransactionNo()

      if (immediate) {
        await tx.pointsAccount.update({
          where: { id: accountId },
          data: {
            availablePoints: balanceAfter,
            totalEarned: points > 0 ? { increment: points } : undefined,
            totalSpent: points < 0 ? { increment: Math.abs(points) } : undefined
          }
        })
        if (points > 0) {
          totalEarned += points
          await this.refreshLevel(tx, accountId, totalEarned)
        }
      } else if (points < 0) {
        await tx.pointsAccount.update({
          where: { id: accountId },
          data: {
            availablePoints: { decrement: Math.abs(points) },
            frozenPoints: { increment: Math.abs(points) }
          }
        })
      }

      const extraData: Record<string, unknown> = {
        ...(input.extra || {})
      }
      if (input.operatorId != null) {
        extraData.operatorId = input.operatorId
      }
      if (input.operatorName) {
        extraData.operatorName = input.operatorName
      }

      await tx.pointsTransaction.create({
        data: {
          transactionNo,
          userId: BigInt(input.userId),
          accountId,
          type: transactionType,
          points,
          balanceBefore: available,
          balanceAfter: immediate
            ? balanceAfter
            : points < 0
              ? available - Math.abs(points)
              : available,
          source: input.source,
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          description: input.description,
          expireAt,
          status,
          extraData:
            Object.keys(extraData).length > 0
              ? (extraData as Prisma.InputJsonValue)
              : undefined
        }
      })

      if (rule && points > 0 && !input.skipRuleLimit) {
        await this.bumpRuleLimit(tx, input.userId, rule.code, points)
      }

      return {
        transactionNo,
        success: true,
        points,
        balanceAfter: immediate
          ? balanceAfter
          : points < 0
            ? available - Math.abs(points)
            : available,
        message: immediate ? '操作成功' : '已进入待确认状态'
      }
    })

    return result
  }

  async checkIn(userId: number) {
    const today = this.todayDateOnly()
    const existing = await this.prisma.client.pointsCheckIn.findUnique({
      where: {
        userId_checkInDate: {
          userId: BigInt(userId),
          checkInDate: today
        }
      }
    })
    if (existing) {
      throw new BadRequestException('今日已签到')
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayRow = await this.prisma.client.pointsCheckIn.findUnique({
      where: {
        userId_checkInDate: {
          userId: BigInt(userId),
          checkInDate: yesterday
        }
      }
    })
    const consecutiveDays = (yesterdayRow?.consecutiveDays || 0) + 1

    const rule = await this.prisma.client.pointsRule.findFirst({
      where: { code: 'DAILY_CHECK_IN', enabled: 1 }
    })
    const points = rule ? Math.floor(Number(rule.pointsValue)) : 10
    const firstCount = await this.prisma.client.pointsCheckIn.count({
      where: { userId: BigInt(userId) }
    })

    try {
      await this.prisma.client.pointsCheckIn.create({
        data: {
          userId: BigInt(userId),
          checkInDate: today,
          pointsEarned: points,
          consecutiveDays
        }
      })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('今日已签到')
      }
      throw e
    }

    try {
      const op = await this.operatePoints({
        userId,
        points,
        source: 'CHECK_IN',
        description: `每日签到奖励（连续${consecutiveDays}天）`,
        immediate: true,
        ruleCode: 'DAILY_CHECK_IN',
        // 签到日唯一性已由 points_check_in 约束，避免与规则日限额日期键不一致导致误拦
        skipRuleLimit: true
      })

      return {
        points,
        consecutiveDays,
        totalPoints: op.balanceAfter,
        isFirstCheckIn: firstCount === 0
      }
    } catch (e) {
      await this.prisma.client.pointsCheckIn.delete({
        where: {
          userId_checkInDate: {
            userId: BigInt(userId),
            checkInDate: today
          }
        }
      })
      throw e
    }
  }

  async getCheckInStatus(userId: number) {
    const today = this.todayDateOnly()
    const todayRow = await this.prisma.client.pointsCheckIn.findUnique({
      where: {
        userId_checkInDate: {
          userId: BigInt(userId),
          checkInDate: today
        }
      }
    })

    const weekStatus: boolean[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const row = await this.prisma.client.pointsCheckIn.findUnique({
        where: {
          userId_checkInDate: {
            userId: BigInt(userId),
            checkInDate: d
          }
        }
      })
      weekStatus.push(!!row)
    }

    return {
      hasCheckedInToday: !!todayRow,
      consecutiveDays: todayRow?.consecutiveDays || 0,
      weekStatus
    }
  }

  async calculateDeduction(points: number) {
    const rate = 0.01
    const n = Math.max(0, Number(points) || 0)
    return {
      deductionAmount: Number((n * rate).toFixed(2)),
      rate
    }
  }
}
