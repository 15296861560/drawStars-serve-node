import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PointsService } from '../points/points.service'

type AuthInfo = { uid?: string | number; userId?: string | number }

type RewardItem = {
  type: string
  config?: Record<string, unknown>
  description?: string
}

type RewardConfig = { rewards?: RewardItem[] }

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService
  ) {}

  resolveUserId(
    auth?: AuthInfo,
    queryUserId?: string | number,
    bodyUserId?: string | number
  ): number {
    return this.pointsService.resolveUserId(auth, queryUserId, bodyUserId)
  }

  tryResolveUserId(
    auth?: AuthInfo,
    queryUserId?: string | number
  ): number | null {
    try {
      return this.resolveUserId(auth, queryUserId)
    } catch {
      return null
    }
  }

  private toIso(d?: Date | null) {
    return d ? d.toISOString() : null
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch {
        return fallback
      }
    }
    return value as T
  }

  private parseRewardConfig(value: unknown): RewardConfig {
    const parsed = this.parseJson<RewardConfig>(value, { rewards: [] })
    if (!parsed || !Array.isArray(parsed.rewards)) {
      return { rewards: [] }
    }
    return parsed
  }

  private mapCategory(row: {
    id: bigint
    name: string
    code: string
    parentId: bigint | null
    sort: number
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      code: row.code,
      parentId: row.parentId != null ? Number(row.parentId) : null,
      sort: row.sort
    }
  }

  private buildUserProgress(
    inst:
      | {
          id: bigint
          status: string
          currentCount: number
          targetCount: number
          rewardClaimed: number
          completedAt: Date | null
          submitPayload?: unknown
        }
      | null
      | undefined,
    targetCount: number,
    extras?: { claimStatus?: string | null }
  ) {
    if (!inst) {
      return {
        status: 'NONE',
        currentCount: 0,
        targetCount,
        rewardClaimed: false,
        completedSubTaskIds: [] as number[],
        claimStatus: extras?.claimStatus ?? null
      }
    }
    const payload = this.parseJson<{ completedSubTaskIds?: unknown }>(
      inst.submitPayload,
      {}
    )
    const completedSubTaskIds = Array.isArray(payload.completedSubTaskIds)
      ? payload.completedSubTaskIds
          .map(id => Number(id))
          .filter(n => Number.isFinite(n))
      : []
    return {
      status: inst.status,
      currentCount: inst.currentCount,
      targetCount: inst.targetCount,
      rewardClaimed: !!inst.rewardClaimed,
      instanceId: Number(inst.id),
      completedAt: this.toIso(inst.completedAt),
      progressPercent: Math.round(
        (inst.currentCount / Math.max(inst.targetCount, 1)) * 100
      ),
      completedSubTaskIds,
      claimStatus: extras?.claimStatus ?? null
    }
  }

  private mapTask(
    row: {
      id: bigint
      taskNo?: string | null
      title: string
      description: string | null
      icon: string | null
      categoryId: bigint
      taskType: string
      conditionType: string
      conditionConfig: unknown
      difficulty: number
      tags: unknown
      rewardConfig: unknown
      targetCount: number
      status: string
      assignMode: string
      completionMode: string | null
      unlockMode: string | null
      children: unknown
      startTime: Date | null
      endTime: Date | null
      dailyLimit: number | null
      totalLimit: number | null
      acceptValidHours: number | null
      rejectReason: string | null
      createdBy: bigint
      priority: number
      createdAt: Date
      updatedAt: Date
      category?: {
        id: bigint
        name: string
        code: string
        parentId: bigint | null
        sort: number
      } | null
    },
    userProgress?: ReturnType<TaskService['buildUserProgress']> | null
  ) {
    const children = this.parseJson<unknown[]>(row.children, [])
    const remainingTime =
      row.endTime != null
        ? Math.max(0, Math.floor((row.endTime.getTime() - Date.now()) / 1000))
        : null

    return {
      id: Number(row.id),
      taskNo: row.taskNo || undefined,
      title: row.title,
      description: row.description || undefined,
      icon: row.icon || undefined,
      categoryId: Number(row.categoryId),
      category: row.category ? this.mapCategory(row.category) : undefined,
      taskType: row.taskType,
      conditionType: row.conditionType,
      conditionConfig: this.parseJson(row.conditionConfig, {}),
      difficulty: row.difficulty,
      tags: this.parseJson<string[]>(row.tags, []),
      rewardConfig: this.parseRewardConfig(row.rewardConfig),
      targetCount: row.targetCount,
      status: row.status,
      assignMode: row.assignMode,
      completionMode: row.completionMode || undefined,
      unlockMode: row.unlockMode || undefined,
      children,
      subTaskCount: Array.isArray(children) ? children.length : 0,
      startTime: this.toIso(row.startTime),
      endTime: this.toIso(row.endTime),
      dailyLimit: row.dailyLimit ?? undefined,
      totalLimit: row.totalLimit ?? undefined,
      acceptValidHours: row.acceptValidHours ?? null,
      rejectReason: row.rejectReason,
      createdBy: Number(row.createdBy),
      priority: row.priority,
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt),
      remainingTime,
      userProgress: userProgress === undefined ? null : userProgress
    }
  }

  private mapInstance(
    row: {
      id: bigint
      taskId: bigint
      userId: bigint
      status: string
      currentCount: number
      targetCount: number
      rewardClaimed: number
      acceptedAt: Date
      completedAt: Date | null
      expiredAt: Date | null
      submitPayload?: unknown
      task?: Parameters<TaskService['mapTask']>[0] | null
    },
    extras?: {
      shippingAddress?: Record<string, string> | null
      logisticsCompany?: string | null
      trackingNo?: string | null
      claimStatus?: string | null
    }
  ) {
    return {
      id: Number(row.id),
      taskId: Number(row.taskId),
      userId: Number(row.userId),
      status: row.status,
      currentCount: row.currentCount,
      targetCount: row.targetCount,
      rewardClaimed: !!row.rewardClaimed,
      acceptedAt: this.toIso(row.acceptedAt) || undefined,
      completedAt: this.toIso(row.completedAt),
      expiredAt: this.toIso(row.expiredAt),
      claimStatus: extras?.claimStatus ?? null,
      task: row.task
        ? this.mapTask(
            row.task,
            this.buildUserProgress(row, row.task.targetCount, {
              claimStatus: extras?.claimStatus ?? null
            })
          )
        : undefined,
      shippingAddress: extras?.shippingAddress ?? null,
      logisticsCompany: extras?.logisticsCompany ?? null,
      trackingNo: extras?.trackingNo ?? null
    }
  }

  private mapClaim(row: {
    id: bigint
    instanceId: bigint
    taskId: bigint
    userId: bigint
    itemName: string
    status: string
    address: unknown
    logisticsCompany: string | null
    trackingNo: string | null
    createdAt: Date
    task?: { title: string } | null
    userName?: string | null
  }) {
    return {
      id: Number(row.id),
      instanceId: Number(row.instanceId),
      taskId: Number(row.taskId),
      taskTitle: row.task?.title || '',
      userId: Number(row.userId),
      userName: row.userName || undefined,
      itemName: row.itemName,
      status: row.status,
      address: this.parseJson(row.address, null),
      logisticsCompany: row.logisticsCompany,
      trackingNo: row.trackingNo,
      createdAt: this.toIso(row.createdAt) || new Date().toISOString()
    }
  }

  private mapNotification(row: {
    id: bigint
    userId: bigint
    taskId: bigint | null
    title: string
    content: string
    type: string
    read: number
    createdAt: Date
  }) {
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      taskId: row.taskId != null ? Number(row.taskId) : undefined,
      title: row.title,
      content: row.content,
      type: row.type,
      read: !!row.read,
      createdAt: this.toIso(row.createdAt) || new Date().toISOString()
    }
  }

  private startOfToday(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  private taskTypePrefix(taskType: string): string {
    const map: Record<string, string> = {
      DAILY: 'DLY',
      ONCE: 'ONC',
      LIMITED: 'LTD',
      ACHIEVEMENT: 'ACH',
      CUSTOM: 'CUS'
    }
    return map[String(taskType || '').toUpperCase()] || 'TSK'
  }

  private formatDayKey(d = new Date()): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }

  /**
   * 任务编号：类型编码 + 日期(YYYYMMDD) + 当日序号(4位)
   * 例：DLY202608070001
   * 唯一索引 + 冲突重试，兼容并发创建
   */
  private async allocateTaskNo(taskType: string): Promise<string> {
    const prefix = `${this.taskTypePrefix(taskType)}${this.formatDayKey()}`
    for (let attempt = 0; attempt < 8; attempt++) {
      const latest = await this.prisma.client.taskDef.findFirst({
        where: { taskNo: { startsWith: prefix } },
        orderBy: { taskNo: 'desc' },
        select: { taskNo: true }
      })
      let next = 1
      if (latest?.taskNo && latest.taskNo.startsWith(prefix)) {
        const tail = latest.taskNo.slice(prefix.length)
        const n = Number(tail)
        if (Number.isFinite(n) && n >= 0) next = n + 1
      }
      next += attempt
      if (next > 9999) {
        // 同日序号溢出：追加时分秒降低冲突
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        const ss = String(now.getSeconds()).padStart(2, '0')
        return `${prefix}${hh}${mm}${ss}${String(attempt).padStart(2, '0')}`
      }
      const taskNo = `${prefix}${String(next).padStart(4, '0')}`
      const exists = await this.prisma.client.taskDef.findUnique({
        where: { taskNo },
        select: { id: true }
      })
      if (!exists) return taskNo
    }
    // 兜底：毫秒时间戳，保证可写
    return `${prefix}${Date.now().toString().slice(-8)}`
  }

  private formatDateKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  private csvEscape(value: unknown): string {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  private async notifyUser(
    userId: number,
    taskId: number | null,
    title: string,
    content: string,
    type: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || this.prisma.client
    await client.taskNotification.create({
      data: {
        userId: BigInt(userId),
        taskId: taskId != null ? BigInt(taskId) : null,
        title: title.slice(0, 128),
        content: content.slice(0, 512),
        type,
        read: 0
      }
    })
  }

  private mapRewardTemplate(row: {
    id: bigint
    name: string
    rewardConfig: unknown
    createdBy: bigint
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      rewardConfig: this.parseRewardConfig(row.rewardConfig),
      createdBy: Number(row.createdBy),
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }

  private mapTaskTemplate(row: {
    id: bigint
    name: string
    payload: unknown
    createdBy: bigint
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: Number(row.id),
      name: row.name,
      payload: this.parseJson(row.payload, {}),
      createdBy: Number(row.createdBy),
      createdAt: this.toIso(row.createdAt),
      updatedAt: this.toIso(row.updatedAt)
    }
  }

  private async loadInstanceMap(userId: number, taskIds: bigint[]) {
    if (!taskIds.length)
      return new Map<
        string,
        Awaited<
          ReturnType<typeof this.prisma.client.taskInstance.findMany>
        >[number]
      >()
    const rows = await this.prisma.client.taskInstance.findMany({
      where: {
        userId: BigInt(userId),
        taskId: { in: taskIds }
      }
    })
    const map = new Map<string, (typeof rows)[number]>()
    for (const r of rows) map.set(String(r.taskId), r)
    return map
  }

  async getCategories() {
    const rows = await this.prisma.client.taskCategory.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
    return rows.map(r => this.mapCategory(r))
  }

  async listHallTasks(userId: number | null, query: Record<string, string>) {
    const page = Math.max(1, Number(query.curPage || query.page || 1) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, Number(query.pageSize || 20) || 20)
    )

    const where: Prisma.TaskDefWhereInput = {
      status: 'APPROVED'
    }
    if (query.categoryId) where.categoryId = BigInt(Number(query.categoryId))
    if (query.taskType) where.taskType = query.taskType
    if (query.keyword) {
      where.title = { contains: query.keyword }
    }
    if (query.status && query.status !== 'APPROVED') {
      // hall only shows APPROVED; ignore other status filters from UI noise
    }

    let orderBy: Prisma.TaskDefOrderByWithRelationInput[] = [
      { priority: 'desc' },
      { id: 'desc' }
    ]
    if (query.sort === 'newest') {
      orderBy = [{ createdAt: 'desc' }]
    } else if (query.sort === 'oldest') {
      orderBy = [{ createdAt: 'asc' }]
    }

    const [total, rows, approvedCount] = await Promise.all([
      this.prisma.client.taskDef.count({ where }),
      this.prisma.client.taskDef.findMany({
        where,
        include: { category: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.client.taskDef.count({ where: { status: 'APPROVED' } })
    ])

    const instMap = userId
      ? await this.loadInstanceMap(
          userId,
          rows.map(r => r.id)
        )
      : new Map()

    const list = rows.map(row => {
      const inst = instMap.get(String(row.id))
      return this.mapTask(row, this.buildUserProgress(inst, row.targetCount))
    })

    let completedToday = 0
    let availableTasks = approvedCount
    let pointsToday = 0
    let itemsToday = 0

    if (userId) {
      const today = this.startOfToday()
      const mine = await this.prisma.client.taskInstance.findMany({
        where: { userId: BigInt(userId) }
      })
      completedToday = mine.filter(
        i =>
          i.completedAt &&
          i.completedAt >= today &&
          ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED'].includes(i.status)
      ).length
      const takenIds = new Set(mine.map(i => String(i.taskId)))
      availableTasks = Math.max(0, approvedCount - takenIds.size)

      const claimsToday = await this.prisma.client.taskRewardClaim.count({
        where: {
          userId: BigInt(userId),
          createdAt: { gte: today }
        }
      })
      itemsToday = claimsToday

      const txToday = await this.prisma.client.pointsTransaction.aggregate({
        where: {
          userId: BigInt(userId),
          source: 'COMPLETE_TASK',
          createdAt: { gte: today },
          points: { gt: 0 }
        },
        _sum: { points: true }
      })
      pointsToday = txToday._sum.points || 0
    }

    return {
      list,
      statistics: {
        totalTasks: approvedCount,
        completedToday,
        availableTasks,
        totalRewardToday: { points: pointsToday, items: itemsToday }
      },
      pagination: { page, pageSize, total }
    }
  }

  async getTaskDetail(taskId: number, userId: number | null) {
    const row = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) },
      include: { category: true }
    })
    if (!row || row.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    let progress = this.buildUserProgress(null, row.targetCount)
    if (userId) {
      const inst = await this.prisma.client.taskInstance.findUnique({
        where: {
          userId_taskId: {
            userId: BigInt(userId),
            taskId: BigInt(taskId)
          }
        }
      })
      let claimStatus: string | null = null
      if (inst) {
        const claim = await this.prisma.client.taskRewardClaim.findFirst({
          where: {
            instanceId: inst.id,
            userId: BigInt(userId)
          },
          orderBy: { id: 'desc' }
        })
        claimStatus = claim?.status ?? null
      }
      progress = this.buildUserProgress(inst, row.targetCount, { claimStatus })
    }
    return this.mapTask(row, progress)
  }

  async acceptTask(taskId: number, userId: number) {
    const task = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) },
      include: { category: true }
    })
    if (!task || task.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    if (task.status !== 'APPROVED') {
      throw new BadRequestException('task is not available to accept')
    }

    const existing = await this.prisma.client.taskInstance.findUnique({
      where: {
        userId_taskId: {
          userId: BigInt(userId),
          taskId: BigInt(taskId)
        }
      }
    })
    if (existing) {
      return this.mapInstance({ ...existing, task })
    }

    let expiredAt: Date | null = null
    if (task.acceptValidHours && task.acceptValidHours > 0) {
      expiredAt = new Date(Date.now() + task.acceptValidHours * 60 * 60 * 1000)
    } else if (task.endTime) {
      expiredAt = task.endTime
    }

    try {
      const created = await this.prisma.client.taskInstance.create({
        data: {
          taskId: BigInt(taskId),
          userId: BigInt(userId),
          status: 'IN_PROGRESS',
          currentCount: 0,
          targetCount: task.targetCount,
          rewardClaimed: 0,
          expiredAt
        }
      })
      return this.mapInstance({ ...created, task })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const again = await this.prisma.client.taskInstance.findUnique({
          where: {
            userId_taskId: {
              userId: BigInt(userId),
              taskId: BigInt(taskId)
            }
          }
        })
        if (again) return this.mapInstance({ ...again, task })
      }
      throw e
    }
  }

  async submitTask(
    taskId: number,
    userId: number,
    payload?: Record<string, unknown>
  ) {
    const task = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) },
      include: { category: true }
    })
    if (!task || task.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }

    const inst = await this.prisma.client.taskInstance.findUnique({
      where: {
        userId_taskId: {
          userId: BigInt(userId),
          taskId: BigInt(taskId)
        }
      }
    })
    if (!inst) {
      throw new BadRequestException('accept task first')
    }
    if (
      inst.status === 'COMPLETED' ||
      inst.status === 'REWARD_PENDING' ||
      inst.status === 'REWARD_CLAIMED'
    ) {
      return this.mapInstance({ ...inst, task })
    }
    if (inst.status !== 'IN_PROGRESS' && inst.status !== 'SUBMITTED') {
      throw new BadRequestException('invalid status for submit')
    }
    if (inst.expiredAt && inst.expiredAt.getTime() < Date.now()) {
      await this.prisma.client.taskInstance.update({
        where: { id: inst.id },
        data: { status: 'EXPIRED' }
      })
      throw new BadRequestException('task expired')
    }

    const children = this.parseJson<{ id?: number | string }[]>(
      task.children,
      []
    )
    const hasChildren = Array.isArray(children) && children.length > 0
    const subTaskIdRaw = payload?.subTaskId
    let nextCount: number
    let targetCount = inst.targetCount
    let done: boolean
    let submitPayload: Prisma.InputJsonValue | undefined

    if (hasChildren && subTaskIdRaw != null) {
      const subTaskId = String(subTaskIdRaw)
      const prevPayload = this.parseJson<Record<string, unknown>>(
        inst.submitPayload,
        {}
      )
      const completedIds = this.parseJson<string[]>(
        prevPayload.completedSubTaskIds,
        []
      )
      if (!completedIds.includes(subTaskId)) {
        completedIds.push(subTaskId)
      }
      targetCount = children.length > 0 ? children.length : task.targetCount
      nextCount = completedIds.length
      const completionMode = task.completionMode || 'ALL'
      if (completionMode === 'ANY_N') {
        done = nextCount >= task.targetCount
      } else {
        done = nextCount >= targetCount
      }
      submitPayload = {
        ...prevPayload,
        ...(payload || {}),
        completedSubTaskIds: completedIds
      } as Prisma.InputJsonValue
    } else {
      nextCount = Math.min(inst.currentCount + 1, inst.targetCount)
      done = nextCount >= inst.targetCount
      submitPayload =
        payload && Object.keys(payload).length
          ? (payload as Prisma.InputJsonValue)
          : undefined
    }

    const nextStatus = done ? 'REWARD_PENDING' : 'IN_PROGRESS'
    const completedAt = done ? new Date() : null

    const updated = await this.prisma.client.$transaction(async tx => {
      const row = await tx.taskInstance.update({
        where: { id: inst.id },
        data: {
          currentCount: nextCount,
          targetCount,
          status: nextStatus,
          completedAt: completedAt ?? undefined,
          submitPayload: submitPayload ?? undefined
        }
      })

      if (done) {
        const rewards = this.parseRewardConfig(task.rewardConfig).rewards || []
        for (const reward of rewards) {
          if (reward.type !== 'PHYSICAL') continue
          const itemName =
            String(
              (reward.config?.itemName as string) ||
                (reward.config?.item_name as string) ||
                reward.description ||
                'physical reward'
            ).slice(0, 128) || 'physical reward'
          try {
            await tx.taskRewardClaim.create({
              data: {
                instanceId: row.id,
                taskId: BigInt(taskId),
                userId: BigInt(userId),
                itemName,
                status: 'PENDING_ADDRESS'
              }
            })
          } catch (e) {
            if (
              !(
                e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === 'P2002'
              )
            ) {
              throw e
            }
          }
        }

        await this.notifyUser(
          userId,
          taskId,
          '任务完成',
          `您已完成任务「${task.title}」，请领取奖励`,
          'TASK_COMPLETED',
          tx
        )
      }

      return row
    })

    return this.mapInstance({ ...updated, task })
  }

  async claimReward(taskId: number, userId: number) {
    const task = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) },
      include: { category: true }
    })
    if (!task || task.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }

    const inst = await this.prisma.client.taskInstance.findUnique({
      where: {
        userId_taskId: {
          userId: BigInt(userId),
          taskId: BigInt(taskId)
        }
      }
    })
    if (!inst) {
      throw new BadRequestException('instance not found')
    }

    if (inst.rewardClaimed || inst.status === 'REWARD_CLAIMED') {
      return {
        success: true,
        message: 'already claimed',
        instance: this.mapInstance({ ...inst, task })
      }
    }

    if (inst.status !== 'REWARD_PENDING' && inst.status !== 'COMPLETED') {
      throw new BadRequestException('cannot claim now')
    }

    // Mark claimed first (idempotent) then grant points
    const marked = await this.prisma.client.taskInstance.updateMany({
      where: {
        id: inst.id,
        rewardClaimed: 0,
        status: { in: ['REWARD_PENDING', 'COMPLETED'] }
      },
      data: {
        rewardClaimed: 1,
        status: 'REWARD_CLAIMED'
      }
    })

    if (marked.count === 0) {
      const again = await this.prisma.client.taskInstance.findUnique({
        where: { id: inst.id }
      })
      return {
        success: true,
        message: 'already claimed',
        instance: this.mapInstance({ ...(again || inst), task })
      }
    }

    const rewards = this.parseRewardConfig(task.rewardConfig).rewards || []
    for (const reward of rewards) {
      if (reward.type !== 'POINTS') continue
      const amount = Number(reward.config?.amount || 0)
      if (!Number.isFinite(amount) || amount <= 0) continue

      // Idempotent: skip if COMPLETE_TASK txn already exists for this user+task
      const existed = await this.prisma.client.pointsTransaction.findFirst({
        where: {
          userId: BigInt(userId),
          source: 'COMPLETE_TASK',
          referenceType: 'TASK',
          referenceId: String(taskId),
          points: { gt: 0 }
        }
      })
      if (existed) continue

      await this.pointsService.operatePoints({
        userId,
        points: amount,
        source: 'COMPLETE_TASK',
        referenceId: String(taskId),
        referenceType: 'TASK',
        description: `\u5b8c\u6210\u4efb\u52a1\uff1a${task.title}`,
        immediate: true
      })
    }

    const updated = await this.prisma.client.taskInstance.findUnique({
      where: { id: inst.id }
    })

    return {
      success: true,
      message: 'claimed',
      instance: this.mapInstance({ ...(updated || inst), task })
    }
  }

  async saveShippingAddress(
    taskId: number,
    userId: number,
    address: { name: string; phone: string; address: string }
  ) {
    if (!address?.name || !address?.phone || !address?.address) {
      throw new BadRequestException('invalid address')
    }

    const claim = await this.prisma.client.taskRewardClaim.findFirst({
      where: {
        taskId: BigInt(taskId),
        userId: BigInt(userId),
        status: { in: ['PENDING_ADDRESS', 'PENDING_SHIP'] }
      },
      include: { task: true },
      orderBy: { id: 'desc' }
    })
    if (!claim) {
      throw new BadRequestException('claim not found')
    }

    const updated = await this.prisma.client.taskRewardClaim.update({
      where: { id: claim.id },
      data: {
        address: address as unknown as Prisma.InputJsonValue,
        status: 'PENDING_SHIP'
      },
      include: { task: true }
    })

    return this.mapClaim(updated)
  }

  async getMyTasks(userId: number, tab?: string) {
    const rows = await this.prisma.client.taskInstance.findMany({
      where: { userId: BigInt(userId) },
      include: { task: { include: { category: true } } },
      orderBy: { acceptedAt: 'desc' }
    })

    const claims = await this.prisma.client.taskRewardClaim.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { id: 'desc' }
    })
    const claimByInstance = new Map<string, (typeof claims)[number]>()
    for (const c of claims) {
      const key = String(c.instanceId)
      if (!claimByInstance.has(key)) claimByInstance.set(key, c)
    }

    const list = rows.map(row => {
      const claim = claimByInstance.get(String(row.id))
      const addr = claim
        ? this.parseJson<Record<string, string> | null>(claim.address, null)
        : null
      return this.mapInstance(row, {
        shippingAddress: addr,
        logisticsCompany: claim?.logisticsCompany ?? null,
        trackingNo: claim?.trackingNo ?? null,
        claimStatus: claim?.status ?? null
      })
    })

    const groups = {
      inProgress: list.filter(
        i => i.status === 'IN_PROGRESS' || i.status === 'SUBMITTED'
      ),
      rewardPending: list.filter(i => i.status === 'REWARD_PENDING'),
      completed: list.filter(
        i => i.status === 'COMPLETED' || i.status === 'REWARD_CLAIMED'
      ),
      assigned: list.filter(i => i.status === 'ASSIGNED'),
      expired: list.filter(i => i.status === 'EXPIRED')
    }

    if (!tab || tab === 'all') {
      return { list, groups }
    }

    const map: Record<string, keyof typeof groups> = {
      in_progress: 'inProgress',
      inProgress: 'inProgress',
      reward_pending: 'rewardPending',
      rewardPending: 'rewardPending',
      completed: 'completed',
      assigned: 'assigned',
      expired: 'expired'
    }
    const key = map[tab] || 'inProgress'
    return { list: groups[key] || [], groups }
  }

  async getMyStats(userId: number) {
    const mine = await this.prisma.client.taskInstance.findMany({
      where: { userId: BigInt(userId) }
    })
    const points = await this.prisma.client.pointsTransaction.aggregate({
      where: {
        userId: BigInt(userId),
        source: 'COMPLETE_TASK',
        points: { gt: 0 }
      },
      _sum: { points: true }
    })

    return {
      inProgress: mine.filter(i => i.status === 'IN_PROGRESS').length,
      completed: mine.filter(
        i => i.status === 'COMPLETED' || i.status === 'REWARD_CLAIMED'
      ).length,
      rewardPending: mine.filter(i => i.status === 'REWARD_PENDING').length,
      totalAccepted: mine.length,
      totalPoints: points._sum.points || 0
    }
  }

  async getAchievements(userId: number) {
    const rows = await this.prisma.client.taskDef.findMany({
      where: {
        taskType: 'ACHIEVEMENT',
        status: { not: 'DELETED' }
      },
      include: { category: true },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }]
    })
    const instMap = await this.loadInstanceMap(
      userId,
      rows.map(r => r.id)
    )
    return rows.map(row =>
      this.mapTask(
        row,
        this.buildUserProgress(instMap.get(String(row.id)), row.targetCount)
      )
    )
  }

  async getNotifications(userId: number) {
    const rows = await this.prisma.client.taskNotification.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
    return rows.map(r => this.mapNotification(r))
  }

  async readNotification(userId: number, id: number) {
    await this.prisma.client.taskNotification.updateMany({
      where: { id: BigInt(id), userId: BigInt(userId) },
      data: { read: 1 }
    })
    return true
  }

  async adminListTasks(query: Record<string, string>) {
    const page = Math.max(1, Number(query.curPage || query.page || 1) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, Number(query.pageSize || 20) || 20)
    )
    const where: Prisma.TaskDefWhereInput = {
      status: { not: 'DELETED' }
    }
    const title = query.title || query.keyword
    if (title) {
      where.OR = [
        { title: { contains: title } },
        { taskNo: { contains: title } }
      ]
    }
    if (query.taskNo) where.taskNo = { contains: query.taskNo }
    if (query.status) where.status = query.status
    if (query.taskType) where.taskType = query.taskType
    if (query.categoryId) where.categoryId = BigInt(Number(query.categoryId))

    const [total, rows] = await Promise.all([
      this.prisma.client.taskDef.count({ where }),
      this.prisma.client.taskDef.findMany({
        where,
        include: { category: true },
        orderBy: [{ priority: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return {
      list: rows.map(r => this.mapTask(r, null)),
      total
    }
  }

  async adminGetTask(id: number) {
    const row = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) },
      include: { category: true }
    })
    if (!row || row.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    return this.mapTask(row, null)
  }

  async createTask(body: Record<string, unknown>, operatorId: number) {
    const title = String(body.title || '').trim()
    if (!title) throw new BadRequestException('title required')
    if (!body.categoryId) throw new BadRequestException('categoryId required')
    if (!body.taskType) throw new BadRequestException('taskType required')
    if (!body.conditionType) {
      throw new BadRequestException('conditionType required')
    }
    if (!body.rewardConfig) {
      throw new BadRequestException('rewardConfig required')
    }

    const skipAudit = !!body.skipAudit
    const taskType = String(body.taskType)
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      const taskNo = await this.allocateTaskNo(taskType)
      try {
        const created = await this.prisma.client.taskDef.create({
          data: {
            taskNo,
            title,
            description: (body.description as string) || null,
            icon: (body.icon as string) || null,
            categoryId: BigInt(Number(body.categoryId)),
            taskType,
            conditionType: String(body.conditionType),
            conditionConfig: (body.conditionConfig ||
              {}) as Prisma.InputJsonValue,
            difficulty: Number(body.difficulty || 1),
            tags: (body.tags || []) as Prisma.InputJsonValue,
            rewardConfig: body.rewardConfig as Prisma.InputJsonValue,
            targetCount: Number(body.targetCount || 1),
            status: skipAudit ? 'APPROVED' : 'PENDING',
            assignMode: String(body.assignMode || 'PUBLIC'),
            completionMode: (body.completionMode as string) || null,
            unlockMode: (body.unlockMode as string) || null,
            children: (body.children || null) as Prisma.InputJsonValue,
            startTime: body.startTime ? new Date(String(body.startTime)) : null,
            endTime: body.endTime ? new Date(String(body.endTime)) : null,
            dailyLimit:
              body.dailyLimit != null ? Number(body.dailyLimit) : null,
            totalLimit:
              body.totalLimit != null ? Number(body.totalLimit) : null,
            acceptValidHours:
              body.acceptValidHours != null
                ? Number(body.acceptValidHours)
                : null,
            createdBy: BigInt(operatorId),
            priority: Number(body.priority || 0)
          },
          include: { category: true }
        })
        return this.mapTask(created, null)
      } catch (e) {
        lastError = e
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue
        }
        throw e
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BadRequestException('failed to allocate taskNo')
  }

  async updateTask(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }

    const data: Prisma.TaskDefUpdateInput = {}
    if (body.title != null) data.title = String(body.title).trim()
    if (body.description !== undefined) {
      data.description = (body.description as string) || null
    }
    if (body.icon !== undefined) data.icon = (body.icon as string) || null
    if (body.categoryId != null) {
      data.category = { connect: { id: BigInt(Number(body.categoryId)) } }
    }
    if (body.taskType != null) data.taskType = String(body.taskType)
    if (body.conditionType != null) {
      data.conditionType = String(body.conditionType)
    }
    if (body.conditionConfig !== undefined) {
      data.conditionConfig = body.conditionConfig as Prisma.InputJsonValue
    }
    if (body.difficulty != null) data.difficulty = Number(body.difficulty)
    if (body.tags !== undefined) {
      data.tags = body.tags as Prisma.InputJsonValue
    }
    if (body.rewardConfig !== undefined) {
      data.rewardConfig = body.rewardConfig as Prisma.InputJsonValue
    }
    if (body.targetCount != null) {
      data.targetCount = Number(body.targetCount)
    }
    if (body.assignMode != null) data.assignMode = String(body.assignMode)
    if (body.completionMode !== undefined) {
      data.completionMode = (body.completionMode as string) || null
    }
    if (body.unlockMode !== undefined) {
      data.unlockMode = (body.unlockMode as string) || null
    }
    if (body.children !== undefined) {
      data.children = body.children as Prisma.InputJsonValue
    }
    if (body.startTime !== undefined) {
      data.startTime = body.startTime ? new Date(String(body.startTime)) : null
    }
    if (body.endTime !== undefined) {
      data.endTime = body.endTime ? new Date(String(body.endTime)) : null
    }
    if (body.dailyLimit !== undefined) {
      data.dailyLimit = body.dailyLimit != null ? Number(body.dailyLimit) : null
    }
    if (body.totalLimit !== undefined) {
      data.totalLimit = body.totalLimit != null ? Number(body.totalLimit) : null
    }
    if (body.acceptValidHours !== undefined) {
      data.acceptValidHours =
        body.acceptValidHours != null ? Number(body.acceptValidHours) : null
    }
    if (body.priority != null) data.priority = Number(body.priority)
    if (body.status != null) data.status = String(body.status)

    const updated = await this.prisma.client.taskDef.update({
      where: { id: BigInt(id) },
      data,
      include: { category: true }
    })
    return this.mapTask(updated, null)
  }

  async deleteTask(id: number) {
    const existing = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    await this.prisma.client.taskDef.update({
      where: { id: BigInt(id) },
      data: { status: 'DELETED' }
    })
    return true
  }

  async auditTask(
    id: number,
    payload: { action: 'APPROVE' | 'REJECT'; reason?: string }
  ) {
    const existing = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) },
      include: { category: true }
    })
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    if (payload.action === 'APPROVE') {
      const updated = await this.prisma.client.taskDef.update({
        where: { id: BigInt(id) },
        data: { status: 'APPROVED', rejectReason: null },
        include: { category: true }
      })
      await this.notifyUser(
        Number(existing.createdBy),
        id,
        '审核结果',
        `您的任务「${existing.title}」已通过审核`,
        'TASK_AUDITED'
      )
      return this.mapTask(updated, null)
    }
    if (payload.action === 'REJECT') {
      const reason = payload.reason || '未通过审核'
      const updated = await this.prisma.client.taskDef.update({
        where: { id: BigInt(id) },
        data: {
          status: 'REJECTED',
          rejectReason: reason
        },
        include: { category: true }
      })
      await this.notifyUser(
        Number(existing.createdBy),
        id,
        '审核结果',
        `您的任务「${existing.title}」未通过审核：${reason}`,
        'TASK_AUDITED'
      )
      return this.mapTask(updated, null)
    }
    throw new BadRequestException('invalid action')
  }

  async setTaskStatus(id: number, status: string) {
    const existing = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    const updated = await this.prisma.client.taskDef.update({
      where: { id: BigInt(id) },
      data: { status },
      include: { category: true }
    })
    return this.mapTask(updated, null)
  }

  async assignTask(body: { taskId: number; userIds: number[] }) {
    const taskId = Number(body.taskId)
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.map(Number).filter(n => Number.isFinite(n) && n > 0)
      : []
    if (!taskId || !userIds.length) {
      throw new BadRequestException('taskId and userIds required')
    }

    const task = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) }
    })
    if (!task || task.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }

    for (const userId of userIds) {
      const exists = await this.prisma.client.taskInstance.findUnique({
        where: {
          userId_taskId: {
            userId: BigInt(userId),
            taskId: BigInt(taskId)
          }
        }
      })
      if (exists) continue
      try {
        await this.prisma.client.taskInstance.create({
          data: {
            taskId: BigInt(taskId),
            userId: BigInt(userId),
            status: 'ASSIGNED',
            currentCount: 0,
            targetCount: task.targetCount,
            rewardClaimed: 0
          }
        })
        await this.notifyUser(
          userId,
          taskId,
          '您有新任务',
          `管理员为您指派了任务「${task.title}」`,
          'TASK_ASSIGNED'
        )
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue
        }
        throw e
      }
    }

    return true
  }

  async getStatisticsOverview() {
    const today = this.startOfToday()
    const activeWhere: Prisma.TaskDefWhereInput = {
      status: { not: 'DELETED' }
    }

    const [
      totalTasks,
      onlineTasks,
      pendingAudit,
      todayAccept,
      todayComplete,
      todayRewardPointsAgg,
      totalInstances,
      completedInstances
    ] = await Promise.all([
      this.prisma.client.taskDef.count({ where: activeWhere }),
      this.prisma.client.taskDef.count({ where: { status: 'APPROVED' } }),
      this.prisma.client.taskDef.count({ where: { status: 'PENDING' } }),
      this.prisma.client.taskInstance.count({
        where: { acceptedAt: { gte: today } }
      }),
      this.prisma.client.taskInstance.count({
        where: {
          completedAt: { gte: today },
          status: {
            in: ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED']
          }
        }
      }),
      this.prisma.client.pointsTransaction.aggregate({
        where: {
          source: 'COMPLETE_TASK',
          createdAt: { gte: today },
          points: { gt: 0 }
        },
        _sum: { points: true }
      }),
      this.prisma.client.taskInstance.count(),
      this.prisma.client.taskInstance.count({
        where: {
          status: {
            in: ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED']
          }
        }
      })
    ])

    const participationRate =
      totalTasks > 0
        ? Number(
            (
              (
                await this.prisma.client.taskInstance.groupBy({
                  by: ['taskId']
                })
              ).length / totalTasks
            ).toFixed(2)
          )
        : 0

    const completionRate =
      totalInstances > 0
        ? Number((completedInstances / totalInstances).toFixed(2))
        : 0

    return {
      totalTasks,
      onlineTasks,
      pendingAudit,
      todayAccept,
      todayComplete,
      todayRewardPoints: todayRewardPointsAgg._sum.points || 0,
      participationRate,
      completionRate
    }
  }

  async listRewardClaims() {
    const rows = await this.prisma.client.taskRewardClaim.findMany({
      include: { task: true },
      orderBy: { createdAt: 'desc' },
      take: 500
    })

    const userIds = [...new Set(rows.map(r => Number(r.userId)))]
    const users = userIds.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: userIds.map(id => BigInt(id)) } },
          select: { id: true, name: true, accountAlias: true }
        })
      : []
    const nameMap = new Map(
      users.map(u => [Number(u.id), u.accountAlias || u.name || String(u.id)])
    )

    return rows.map(r =>
      this.mapClaim({
        ...r,
        userName: nameMap.get(Number(r.userId)) || null
      })
    )
  }

  async shipReward(body: {
    claimId: number
    logisticsCompany: string
    trackingNo: string
  }) {
    const claimId = Number(body.claimId)
    if (!claimId) throw new BadRequestException('claimId required')
    if (!body.logisticsCompany || !body.trackingNo) {
      throw new BadRequestException('logistics required')
    }

    const existing = await this.prisma.client.taskRewardClaim.findUnique({
      where: { id: BigInt(claimId) },
      include: { task: true }
    })
    if (!existing) throw new NotFoundException('claim not found')

    const updated = await this.prisma.client.taskRewardClaim.update({
      where: { id: BigInt(claimId) },
      data: {
        logisticsCompany: body.logisticsCompany,
        trackingNo: body.trackingNo,
        status: 'SHIPPED'
      },
      include: { task: true }
    })

    await this.notifyUser(
      Number(existing.userId),
      Number(existing.taskId),
      '实物已发货',
      `您的奖励「${existing.itemName}」已发货，${body.logisticsCompany} ${body.trackingNo}`,
      'PHYSICAL_SHIPPED'
    )

    return this.mapClaim(updated)
  }

  async batchAssign(body: {
    taskId: number
    userIds?: number[]
    roleIds?: number[]
  }) {
    let userIds = Array.isArray(body.userIds)
      ? body.userIds.map(Number).filter(n => Number.isFinite(n) && n > 0)
      : []
    if (Array.isArray(body.roleIds) && body.roleIds.length) {
      const roleRows = await this.prisma.client.sysUserRole.findMany({
        where: {
          roleId: { in: body.roleIds.map(id => BigInt(Number(id))) }
        },
        select: { userId: true }
      })
      const fromRoles = roleRows.map(r => Number(r.userId))
      userIds = [...new Set([...userIds, ...fromRoles])]
    }
    return this.assignTask({ taskId: body.taskId, userIds })
  }

  async revokeAssign(body: { taskId: number; userIds: number[] }) {
    const taskId = Number(body.taskId)
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.map(Number).filter(n => Number.isFinite(n) && n > 0)
      : []
    if (!taskId || !userIds.length) {
      throw new BadRequestException('taskId and userIds required')
    }
    const result = await this.prisma.client.taskInstance.deleteMany({
      where: {
        taskId: BigInt(taskId),
        userId: { in: userIds.map(id => BigInt(id)) },
        status: 'ASSIGNED'
      }
    })
    return { revoked: result.count }
  }

  async copyTask(id: number, operatorId: number) {
    const existing = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing || existing.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      const taskNo = await this.allocateTaskNo(existing.taskType)
      try {
        const created = await this.prisma.client.taskDef.create({
          data: {
            taskNo,
            title: `${existing.title}（副本）`.slice(0, 128),
            description: existing.description,
            icon: existing.icon,
            categoryId: existing.categoryId,
            taskType: existing.taskType,
            conditionType: existing.conditionType,
            conditionConfig: (existing.conditionConfig ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            difficulty: existing.difficulty,
            tags: (existing.tags ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            rewardConfig: existing.rewardConfig as Prisma.InputJsonValue,
            targetCount: existing.targetCount,
            status: 'DRAFT',
            assignMode: existing.assignMode,
            completionMode: existing.completionMode,
            unlockMode: existing.unlockMode,
            children: (existing.children ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            startTime: existing.startTime,
            endTime: existing.endTime,
            dailyLimit: existing.dailyLimit,
            totalLimit: existing.totalLimit,
            acceptValidHours: existing.acceptValidHours,
            rejectReason: null,
            createdBy: BigInt(operatorId),
            priority: existing.priority
          },
          include: { category: true }
        })
        return this.mapTask(created, null)
      } catch (e) {
        lastError = e
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue
        }
        throw e
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BadRequestException('failed to allocate taskNo')
  }

  async confirmReceipt(taskId: number, userId: number) {
    const claim = await this.prisma.client.taskRewardClaim.findFirst({
      where: {
        taskId: BigInt(taskId),
        userId: BigInt(userId),
        status: 'SHIPPED'
      },
      include: { task: true },
      orderBy: { id: 'desc' }
    })
    if (!claim) {
      throw new BadRequestException('claim not found or not shipped')
    }
    const updated = await this.prisma.client.taskRewardClaim.update({
      where: { id: claim.id },
      data: { status: 'RECEIVED' },
      include: { task: true }
    })
    await this.notifyUser(
      userId,
      taskId,
      '确认收货',
      `您已确认收到「${claim.itemName}」`,
      'PHYSICAL_RECEIVED'
    )
    return this.mapClaim(updated)
  }

  async adminListCategories() {
    return this.getCategories()
  }

  async createCategory(body: Record<string, unknown>) {
    const name = String(body.name || '').trim()
    const code = String(body.code || '').trim()
    if (!name || !code) {
      throw new BadRequestException('name and code required')
    }
    try {
      const created = await this.prisma.client.taskCategory.create({
        data: {
          name,
          code,
          parentId:
            body.parentId != null ? BigInt(Number(body.parentId)) : null,
          sort: Number(body.sort || 0)
        }
      })
      return this.mapCategory(created)
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('category code already exists')
      }
      throw e
    }
  }

  async updateCategory(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.client.taskCategory.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('category not found')
    const data: Prisma.TaskCategoryUpdateInput = {}
    if (body.name != null) data.name = String(body.name).trim()
    if (body.code != null) data.code = String(body.code).trim()
    if (body.parentId !== undefined) {
      data.parentId =
        body.parentId != null ? BigInt(Number(body.parentId)) : null
    }
    if (body.sort != null) data.sort = Number(body.sort)
    const updated = await this.prisma.client.taskCategory.update({
      where: { id: BigInt(id) },
      data
    })
    return this.mapCategory(updated)
  }

  async deleteCategory(id: number) {
    const existing = await this.prisma.client.taskCategory.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('category not found')
    const refCount = await this.prisma.client.taskDef.count({
      where: { categoryId: BigInt(id), status: { not: 'DELETED' } }
    })
    if (refCount > 0) {
      throw new BadRequestException('category is referenced by tasks')
    }
    await this.prisma.client.taskCategory.delete({
      where: { id: BigInt(id) }
    })
    return true
  }

  async listRewardTemplates() {
    const rows = await this.prisma.client.taskRewardTemplate.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    })
    return rows.map(r => this.mapRewardTemplate(r))
  }

  async createRewardTemplate(
    body: Record<string, unknown>,
    operatorId: number
  ) {
    const name = String(body.name || '').trim()
    if (!name) throw new BadRequestException('name required')
    if (!body.rewardConfig) {
      throw new BadRequestException('rewardConfig required')
    }
    const created = await this.prisma.client.taskRewardTemplate.create({
      data: {
        name,
        rewardConfig: body.rewardConfig as Prisma.InputJsonValue,
        createdBy: BigInt(operatorId)
      }
    })
    return this.mapRewardTemplate(created)
  }

  async updateRewardTemplate(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.client.taskRewardTemplate.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('template not found')
    const data: Prisma.TaskRewardTemplateUpdateInput = {}
    if (body.name != null) data.name = String(body.name).trim()
    if (body.rewardConfig !== undefined) {
      data.rewardConfig = body.rewardConfig as Prisma.InputJsonValue
    }
    const updated = await this.prisma.client.taskRewardTemplate.update({
      where: { id: BigInt(id) },
      data
    })
    return this.mapRewardTemplate(updated)
  }

  async deleteRewardTemplate(id: number) {
    const existing = await this.prisma.client.taskRewardTemplate.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('template not found')
    await this.prisma.client.taskRewardTemplate.delete({
      where: { id: BigInt(id) }
    })
    return true
  }

  async listTaskTemplates() {
    const rows = await this.prisma.client.taskTemplate.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    })
    return rows.map(r => this.mapTaskTemplate(r))
  }

  async createTaskTemplate(body: Record<string, unknown>, operatorId: number) {
    const name = String(body.name || '').trim()
    if (!name) throw new BadRequestException('name required')
    if (!body.payload) throw new BadRequestException('payload required')
    const created = await this.prisma.client.taskTemplate.create({
      data: {
        name,
        payload: body.payload as Prisma.InputJsonValue,
        createdBy: BigInt(operatorId)
      }
    })
    return this.mapTaskTemplate(created)
  }

  async updateTaskTemplate(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.client.taskTemplate.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('template not found')
    const data: Prisma.TaskTemplateUpdateInput = {}
    if (body.name != null) data.name = String(body.name).trim()
    if (body.payload !== undefined) {
      data.payload = body.payload as Prisma.InputJsonValue
    }
    const updated = await this.prisma.client.taskTemplate.update({
      where: { id: BigInt(id) },
      data
    })
    return this.mapTaskTemplate(updated)
  }

  async deleteTaskTemplate(id: number) {
    const existing = await this.prisma.client.taskTemplate.findUnique({
      where: { id: BigInt(id) }
    })
    if (!existing) throw new NotFoundException('template not found')
    await this.prisma.client.taskTemplate.delete({
      where: { id: BigInt(id) }
    })
    return true
  }

  async getStatisticsTrend(query: { days?: number }) {
    const days = Math.min(90, Math.max(1, Number(query.days || 7) || 7))
    const end = this.startOfToday()
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))

    const [acceptRows, completeRows] = await Promise.all([
      this.prisma.client.taskInstance.findMany({
        where: { acceptedAt: { gte: start } },
        select: { acceptedAt: true }
      }),
      this.prisma.client.taskInstance.findMany({
        where: {
          completedAt: { gte: start },
          status: {
            in: ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED']
          }
        },
        select: { completedAt: true }
      })
    ])

    const acceptMap = new Map<string, number>()
    const completeMap = new Map<string, number>()
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = this.formatDateKey(d)
      acceptMap.set(key, 0)
      completeMap.set(key, 0)
    }
    for (const r of acceptRows) {
      const key = this.formatDateKey(r.acceptedAt)
      if (acceptMap.has(key)) acceptMap.set(key, (acceptMap.get(key) || 0) + 1)
    }
    for (const r of completeRows) {
      if (!r.completedAt) continue
      const key = this.formatDateKey(r.completedAt)
      if (completeMap.has(key)) {
        completeMap.set(key, (completeMap.get(key) || 0) + 1)
      }
    }

    return [...acceptMap.keys()].map(date => ({
      date,
      accept: acceptMap.get(date) || 0,
      complete: completeMap.get(date) || 0
    }))
  }

  async getTaskStatistics(taskId: number) {
    const task = await this.prisma.client.taskDef.findUnique({
      where: { id: BigInt(taskId) }
    })
    if (!task || task.status === 'DELETED') {
      throw new NotFoundException('task not found')
    }
    const instances = await this.prisma.client.taskInstance.findMany({
      where: { taskId: BigInt(taskId) }
    })
    const participants = instances.length
    const completed = instances.filter(i =>
      ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED'].includes(i.status)
    ).length
    const expired = instances.filter(i => i.status === 'EXPIRED').length
    const rate =
      participants > 0 ? Number((completed / participants).toFixed(4)) : 0
    const abandonRate =
      participants > 0 ? Number((expired / participants).toFixed(4)) : 0

    const durations = instances
      .filter(i => i.completedAt)
      .map(
        i =>
          (i.completedAt!.getTime() - i.acceptedAt.getTime()) / (1000 * 60 * 60)
      )
    const avgDurationHours =
      durations.length > 0
        ? Number(
            (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)
          )
        : 0

    return {
      taskId,
      title: task.title,
      participants,
      completed,
      rate,
      avgDurationHours,
      abandonRate
    }
  }

  async getUserStatistics(query: { limit?: number }) {
    const limit = Math.min(50, Math.max(1, Number(query.limit || 10) || 10))
    const instances = await this.prisma.client.taskInstance.findMany({
      select: { userId: true, status: true }
    })
    const acceptMap = new Map<number, number>()
    const completeMap = new Map<number, number>()
    for (const row of instances) {
      const uid = Number(row.userId)
      acceptMap.set(uid, (acceptMap.get(uid) || 0) + 1)
      if (
        ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED'].includes(row.status)
      ) {
        completeMap.set(uid, (completeMap.get(uid) || 0) + 1)
      }
    }
    const topUserIds = [...acceptMap.entries()]
      .sort(
        (a, b) => (completeMap.get(b[0]) || 0) - (completeMap.get(a[0]) || 0)
      )
      .slice(0, limit)
      .map(([uid]) => uid)

    const [users, pointsRows] = await Promise.all([
      topUserIds.length
        ? this.prisma.client.user.findMany({
            where: { id: { in: topUserIds.map(id => BigInt(id)) } },
            select: { id: true, name: true, accountAlias: true }
          })
        : [],
      topUserIds.length
        ? this.prisma.client.pointsTransaction.groupBy({
            by: ['userId'],
            where: {
              userId: { in: topUserIds.map(id => BigInt(id)) },
              source: 'COMPLETE_TASK',
              points: { gt: 0 }
            },
            _sum: { points: true }
          })
        : []
    ])
    const nameMap = new Map<number, string>(
      users.map(
        u =>
          [Number(u.id), u.accountAlias || u.name || String(u.id)] as [
            number,
            string
          ]
      )
    )
    const pointsMap = new Map<number, number>(
      pointsRows.map(
        p => [Number(p.userId), p._sum.points || 0] as [number, number]
      )
    )

    return topUserIds.map(userId => ({
      userId,
      userName: nameMap.get(userId) || String(userId),
      acceptCount: acceptMap.get(userId) || 0,
      completeCount: completeMap.get(userId) || 0,
      completedCount: completeMap.get(userId) || 0,
      rewardPoints: pointsMap.get(userId) || 0,
      points: pointsMap.get(userId) || 0
    }))
  }

  async getRewardStatistics() {
    const [pointsAgg, claims, completedInstances] = await Promise.all([
      this.prisma.client.pointsTransaction.aggregate({
        where: { source: 'COMPLETE_TASK', points: { gt: 0 } },
        _sum: { points: true }
      }),
      this.prisma.client.taskRewardClaim.findMany({
        select: { status: true }
      }),
      this.prisma.client.taskInstance.count({
        where: {
          status: {
            in: ['COMPLETED', 'REWARD_PENDING', 'REWARD_CLAIMED']
          }
        }
      })
    ])

    const physicalByStatus: Record<string, number> = {}
    for (const c of claims) {
      physicalByStatus[c.status] = (physicalByStatus[c.status] || 0) + 1
    }
    const received = physicalByStatus.RECEIVED || 0
    const shipped = physicalByStatus.SHIPPED || 0
    const totalPhysical = claims.length
    const claimRate =
      totalPhysical > 0
        ? Number(((received + shipped) / totalPhysical).toFixed(4))
        : 0

    return {
      pointsTotal: pointsAgg._sum.points || 0,
      physicalByStatus,
      completedInstances,
      claimRate
    }
  }

  async exportStatistics(body: { type?: 'overview' | 'claims' | 'tasks' }) {
    const type = body.type || 'overview'
    let filename = 'task-statistics.csv'
    let rows: string[][] = []

    if (type === 'overview') {
      filename = 'task-overview.csv'
      const overview = await this.getStatisticsOverview()
      const trend = await this.getStatisticsTrend({ days: 7 })
      rows = [
        ['metric', 'value'],
        ['totalTasks', String(overview.totalTasks)],
        ['onlineTasks', String(overview.onlineTasks)],
        ['pendingAudit', String(overview.pendingAudit)],
        ['todayAccept', String(overview.todayAccept)],
        ['todayComplete', String(overview.todayComplete)],
        ['todayRewardPoints', String(overview.todayRewardPoints)],
        ['participationRate', String(overview.participationRate)],
        ['completionRate', String(overview.completionRate)],
        [],
        ['date', 'accept', 'complete'],
        ...trend.map(t => [t.date, String(t.accept), String(t.complete)])
      ]
    } else if (type === 'claims') {
      filename = 'task-claims.csv'
      const claims = await this.listRewardClaims()
      rows = [
        [
          'id',
          'taskId',
          'taskTitle',
          'userId',
          'userName',
          'itemName',
          'status',
          'logisticsCompany',
          'trackingNo',
          'createdAt'
        ],
        ...claims.map(c => [
          String(c.id),
          String(c.taskId),
          c.taskTitle,
          String(c.userId),
          c.userName || '',
          c.itemName,
          c.status,
          c.logisticsCompany || '',
          c.trackingNo || '',
          c.createdAt
        ])
      ]
    } else {
      filename = 'task-list-stats.csv'
      const { list } = await this.adminListTasks({
        pageSize: '500',
        curPage: '1'
      })
      rows = [
        ['id', 'title', 'status', 'taskType', 'categoryId', 'targetCount'],
        ...list.map(t => [
          String(t.id),
          t.title,
          t.status,
          t.taskType,
          String(t.categoryId),
          String(t.targetCount)
        ])
      ]
    }

    const content =
      '\uFEFF' +
      rows
        .map(line => line.map(cell => this.csvEscape(cell)).join(','))
        .join('\n')

    return {
      filename,
      contentType: 'text/csv',
      content
    }
  }
}
