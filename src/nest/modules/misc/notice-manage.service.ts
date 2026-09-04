import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { serializeBigInt } from '../../../lib/serialize'
import Notify from '../../../public/provider/notify'

type NoticeBody = {
  id?: number | string
  title?: string
  content?: string
  type?: string
  icon?: string
  status?: string
  pushNotify?: boolean
  create_time?: number | string
  update_time?: number | string
}

@Injectable()
export class NoticeManageService {
  constructor(private readonly prisma: PrismaService) {}

  private toRow(row: {
    id: bigint
    title: string
    content: string | null
    type: string | null
    icon: string | null
    status: string | null
    createTime: bigint | null
    updateTime: bigint | null
  }) {
    return serializeBigInt({
      id: Number(row.id),
      title: row.title,
      content: row.content,
      type: row.type,
      icon: row.icon,
      status: row.status,
      create_time: row.createTime != null ? Number(row.createTime) : null,
      update_time: row.updateTime != null ? Number(row.updateTime) : null
    })
  }

  async list(params: {
    title?: string
    type?: string
    status?: string
    curPage?: string | number
    pageSize?: string | number
  }) {
    const curPage = Math.max(1, Number(params.curPage) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    const where: Prisma.NoticeWhereInput = {}

    if (params.title?.trim()) {
      where.title = { contains: params.title.trim() }
    }
    if (params.type) where.type = params.type
    if (params.status) where.status = params.status

    const [total, rows] = await Promise.all([
      this.prisma.client.notice.count({ where }),
      this.prisma.client.notice.findMany({
        where,
        skip: (curPage - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' }
      })
    ])

    return {
      status: true,
      msg: 'ok',
      data: {
        records: rows.map(r => this.toRow(r)),
        total,
        curPage,
        pageSize
      }
    }
  }

  async detail(id: number) {
    const row = await this.prisma.client.notice.findUnique({
      where: { id: BigInt(id) }
    })
    if (!row) {
      return { status: false, msg: '通知不存在', data: [] }
    }
    return { status: true, msg: 'ok', data: [this.toRow(row)] }
  }

  async create(body: NoticeBody, operatorId?: string | number) {
    if (!body.title?.trim()) {
      return { status: false, msg: '标题不能为空', data: null }
    }
    const now = Date.now()
    const row = await this.prisma.client.notice.create({
      data: {
        title: body.title.trim(),
        content: body.content || null,
        type: body.type || 'rich',
        icon: body.icon || null,
        status: body.status || 'published',
        createTime: BigInt(now),
        updateTime: BigInt(now)
      }
    })

    if (
      body.pushNotify !== false &&
      (body.status || 'published') === 'published'
    ) {
      await this.pushAsInAppNotify(row, operatorId)
    }

    return { status: true, msg: '创建成功', data: this.toRow(row) }
  }

  async update(body: NoticeBody) {
    if (!body.id) {
      return { status: false, msg: '缺少通知 id', data: null }
    }
    const row = await this.prisma.client.notice.update({
      where: { id: BigInt(body.id) },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined
          ? { content: body.content || null }
          : {}),
        ...(body.type !== undefined ? { type: body.type || null } : {}),
        ...(body.icon !== undefined ? { icon: body.icon || null } : {}),
        ...(body.status !== undefined ? { status: body.status || null } : {}),
        updateTime: BigInt(Date.now())
      }
    })
    return { status: true, msg: '更新成功', data: this.toRow(row) }
  }

  async remove(id: number) {
    await this.prisma.client.notice.delete({ where: { id: BigInt(id) } })
    return { status: true, msg: '删除成功', data: true }
  }

  async batchDelete(ids: Array<number | string>) {
    const list = (ids || []).map(Number).filter(Boolean)
    if (!list.length) {
      return { status: false, msg: '未选择数据', data: null }
    }
    await this.prisma.client.notice.deleteMany({
      where: { id: { in: list.map(id => BigInt(id)) } }
    })
    return { status: true, msg: '删除成功', data: true }
  }

  /** 将公告推送给全部用户的站内信 */
  private async pushAsInAppNotify(
    row: {
      title: string
      content: string | null
      type: string | null
    },
    operatorId?: string | number
  ) {
    try {
      const users = await this.prisma.client.user.findMany({
        where: { deletedAt: null },
        select: { id: true },
        take: 2000
      })
      const payload = JSON.stringify({
        title: row.title,
        // 保留完整富文本，供站内信详情渲染
        content: row.content || row.title,
        noticeType: row.type
      })
      await Notify.sendNotifyToUsers({
        sendId: operatorId || 0,
        receiveIds: users.map(u => Number(u.id)),
        notifyType: 'notice',
        notifyMsg: payload
      })
    } catch {
      /* ignore push failures so notice create still succeeds */
    }
  }
}
