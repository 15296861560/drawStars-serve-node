/**
 * 星光排行榜服务（PRD 4.9 段位同源，端点 #22）
 * - 口径：累计星光总榜（party_profile.starVal 降序 top 30），与段位晋升同一数据源；
 *   结算星光暂不入服务端（PRD 4.2 后段接入），任务奖励等服务端入账项实时反映在榜上
 * - 形状对齐小程序 mock.mockRankBoard()：list 项为 { name, starVal, me }，me 由 clientKey 命中；
 *   「我」必在榜（不在 top 30 时补位并按星光重排），并列按 updated_at 升序稳定排（先到先得）
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PartyProfileService } from './party.profile.service'
import { dayKey } from './party.util'

const BOARD_SIZE = 30 // 榜单容量：对齐小程序演示口径的 20 行上下，留少量余量

@Injectable()
export class PartyRankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: PartyProfileService
  ) {}

  /* ---------- GET /rank/board（端点 #22）：星光总榜 + 我的坐标 ---------- */
  async board(clientKey: string) {
    // 读路径不建档：无档案的键用瞬态「我」补位，不再向库里刷幽灵行
    const me =
      (await this.profileService.readProfile(clientKey)) ||
      ({ name: '星河旅人', starVal: 0 } as { name: string; starVal: number })
    // 只展示攒下星光的档案：默认名 0 星的幽灵行不再进榜（存量脏行同时被口径过滤掉）
    const rows = await this.prisma.client.partyProfile.findMany({
      where: { starVal: { gt: 0 } },
      orderBy: [{ starVal: 'desc' }, { updatedAt: 'asc' }],
      take: BOARD_SIZE,
      select: { clientKey: true, name: true, starVal: true },
    })
    const list = rows.map((r) => ({ name: r.name, starVal: r.starVal, me: r.clientKey === clientKey }))
    if (!list.some((r) => r.me)) list.push({ name: me.name, starVal: me.starVal, me: true })
    list.sort((a, b) => b.starVal - a.starVal)
    return { day: dayKey(), list }
  }
}
