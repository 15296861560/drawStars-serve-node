/**
 * 任务中心服务（PRD 4.10 任务中心 / 7.1 REST，端点 #19-#21）
 * - 进度口径：客户端真实行为驱动 bump 上报（开一局/翻星愿签/点亮星愿/打完全场），
 *   服务端按 (client_key, day, task_key) 复合唯一记忆当日进度：封顶 target、领后停记，
 *   与小程序本机账本 utils/tasks.js 完全同口径（在线后服务端为准，离线仍有本机兜底）；
 *   不在服务端埋行为探针，避免污染场次/星愿等既有模块
 * - 入账口径：claim 在事务内「条件置领 + 星光自增 + 流水留痕」三步原子完成，
 *   并发双击只会成功一次；party_star_trans 是对账与后续接 PointsService 的数据源
 * - 每日重置：复用 dayKey()（YYYYMMDD）日键，跨天自然换行开新账，历史行不清理
 *   （量级 = 每人每天 ≤4 行，留作低频历史数据）
 * - 形状对齐小程序 mock / tools 口径：list 项含 key/emoji/title/desc/target/reward/progress/done/claimed
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PartyProfileService } from './party.profile.service'
import { clampInt, dayKey, genId } from './party.util'
import { TASKS, TASK_MAP } from './data/tasks'

/** list 渲染口径：清单常量 + 当日进度状态（对齐小程序 tasks.list()） */
function renderItem(
  def: { key: string; emoji: string; title: string; desc: string; target: number; reward: number },
  progress: number,
  claimed: boolean
) {
  return {
    key: def.key,
    emoji: def.emoji,
    title: def.title,
    desc: def.desc,
    target: def.target,
    reward: def.reward,
    progress,
    done: progress >= def.target,
    claimed: !!claimed,
  }
}

@Injectable()
export class PartyTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: PartyProfileService
  ) {}

  /* ---------- GET /tasks（端点 #19）：当日任务清单 + 我的星光 ---------- */
  async list(clientKey: string) {
    const profile = await this.profileService.ensureProfile(clientKey)
    const day = dayKey()
    const rows = await this.prisma.client.partyTaskProgress.findMany({
      where: { clientKey, day },
    })
    const statusMap: Record<string, { progress: number; claimed: boolean }> = {}
    for (const r of rows) statusMap[r.taskKey] = { progress: r.progress, claimed: r.claimed }
    const list = TASKS.map((t) =>
      renderItem(t, statusMap[t.key] ? statusMap[t.key].progress : 0, !!(statusMap[t.key] && statusMap[t.key].claimed))
    )
    return { day, starVal: profile.starVal, list }
  }

  /* ---------- POST /tasks/bump（端点 #20）：真实行为进度上报（封顶幂等） ---------- */
  async bump(body: Record<string, unknown>, clientKey: string) {
    const def = TASK_MAP[String(body && body.key ? body.key : '')]
    if (!def) return { ok: false, msg: '未知任务' }
    const day = dayKey()
    const inc = clampInt(body && body.inc, 1, def.target, 1)
    const row = await this.prisma.client.partyTaskProgress.findUnique({
      where: { clientKey_day_taskKey: { clientKey, day, taskKey: def.key } },
    })
    // 已领取 / 已达标不再累计（与小程序本机账本同口径）
    if (row && (row.claimed || row.progress >= def.target)) {
      return { key: def.key, progress: row.progress, done: row.progress >= def.target, claimed: row.claimed }
    }
    const progress = Math.min(def.target, (row ? row.progress : 0) + inc)
    await this.prisma.client.partyTaskProgress.upsert({
      where: { clientKey_day_taskKey: { clientKey, day, taskKey: def.key } },
      create: { id: genId(), clientKey, day, taskKey: def.key, progress },
      update: { progress },
    })
    return { key: def.key, progress, done: progress >= def.target, claimed: false }
  }

  /* ---------- POST /tasks/claim（端点 #21）：领取当日奖励（事务入账 + 流水） ---------- */
  async claim(body: Record<string, unknown>, clientKey: string) {
    const def = TASK_MAP[String(body && body.key ? body.key : '')]
    if (!def) return { ok: false, msg: '未知任务' }
    await this.profileService.ensureProfile(clientKey)
    const day = dayKey()
    const row = await this.prisma.client.partyTaskProgress.findUnique({
      where: { clientKey_day_taskKey: { clientKey, day, taskKey: def.key } },
    })
    if (!row || row.progress < def.target) return { ok: false, msg: '任务还没完成，再推一把' }
    if (row.claimed) return { ok: false, msg: '今天已经领过啦' }

    // 条件置领：事务里只有第一个请求能通过（进度达标且未领），防止并发双击重复入账
    const starVal = await this.prisma.client.$transaction(async (tx) => {
      const taken = await tx.partyTaskProgress.updateMany({
        where: { clientKey, day, taskKey: def.key, claimed: false, progress: { gte: def.target } },
        data: { claimed: true },
      })
      if (taken.count === 0) return null
      const updated = await tx.partyProfile.update({
        where: { clientKey },
        data: { starVal: { increment: def.reward } },
      })
      await tx.partyStarTrans.create({
        data: {
          id: genId(),
          clientKey,
          amount: def.reward,
          balanceAfter: updated.starVal,
          source: 'task',
          day,
          remark: def.key,
        },
      })
      return updated.starVal
    })
    if (starVal === null) return { ok: false, msg: '今天已经领过啦' }
    return { ok: true, reward: def.reward, starVal }
  }
}
