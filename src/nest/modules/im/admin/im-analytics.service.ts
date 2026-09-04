import { Injectable } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'

@Injectable()
export class ImAnalyticsService {
  async overview() {
    const now = Date.now()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const since = BigInt(todayStart.getTime())

    const [msgCount, roomCount, activeRooms, reports] = await Promise.all([
      prisma.imMessage.count({ where: { serverTime: { gte: since } } }),
      prisma.imRoom.count({ where: { createdAt: { gte: since } } }),
      prisma.imRoom.count({ where: { status: 'ACTIVE' } }),
      prisma.imReport.count({ where: { status: 'PENDING' } })
    ])

    return {
      msgCount,
      roomCreateToday: roomCount,
      activeRooms,
      pendingReports: reports
    }
  }

  async trends(days = 7) {
    const out: { date: string; count: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const start = BigInt(d.getTime())
      const end = BigInt(d.getTime() + 24 * 60 * 60 * 1000)
      const count = await prisma.imMessage.count({
        where: { serverTime: { gte: start, lt: end } }
      })
      out.push({ date: `${d.getMonth() + 1}-${d.getDate()}`, count })
    }
    return out
  }

  async roomRanking(topN = 10) {
    const since = BigInt(Date.now() - 24 * 60 * 60 * 1000)
    const rooms = await prisma.imRoom.findMany({
      where: { status: 'ACTIVE', categoryId: { not: 'CONFIDE' } }
    })
    const ranked: { roomId: string; title: string; msgCount: number }[] = []
    for (const r of rooms) {
      const conv = await prisma.imConversation.findUnique({
        where: { convType_bizId: { convType: 'ROOM', bizId: r.roomId } }
      })
      const msgCount = conv
        ? await prisma.imMessage.count({
            where: { conversationId: conv.id, serverTime: { gt: since } }
          })
        : 0
      ranked.push({ roomId: r.roomId, title: r.title, msgCount })
    }
    ranked.sort((a, b) => b.msgCount - a.msgCount)
    return ranked.slice(0, topN)
  }
}
