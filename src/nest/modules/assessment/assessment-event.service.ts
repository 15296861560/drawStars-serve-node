import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ASSESSMENT_EVENT_TYPES,
  CHANNEL_SOURCES,
  EVENT_DEDUP_WINDOW_MS,
  EVENT_RATE_LIMIT_PER_MINUTE
} from './assessment.constants'

export interface AssessmentEventPayload {
  eventType?: string
  sessionId?: string
  userId?: number | string | null
  source?: string | null
  refId?: string | null
  target?: string | null
  position?: string | null
  surveyId?: number | string | null
  surveyResponseId?: number | string | null
  isNewUser?: boolean | null
  userAgent?: string | null
}

@Injectable()
export class AssessmentEventService {
  /** sessionId → 最近一分钟内的上报时间戳（进程内限流兜底） */
  private readonly rateMap = new Map<string, number[]>()

  constructor(private readonly prisma: PrismaService) {}

  /** 本地日历日的 UTC 零点，避免 @db.Date 时区偏移 */
  private todayDateOnly(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  }

  private toNumber(value?: number | string | null): number | null {
    if (value === null || value === undefined || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  /** 频率限制：同一会话每分钟最多 60 次，超限丢弃 */
  private checkRateLimit(sessionId: string): boolean {
    const now = Date.now()
    const list = (this.rateMap.get(sessionId) || []).filter(
      t => now - t < 60_000
    )
    if (list.length >= EVENT_RATE_LIMIT_PER_MINUTE) {
      this.rateMap.set(sessionId, list)
      return false
    }
    list.push(now)
    this.rateMap.set(sessionId, list)
    // 防止 Map 无限增长：超过 5000 个会话时清理过期项
    if (this.rateMap.size > 5000) {
      for (const [key, stamps] of this.rateMap) {
        if (!stamps.some(t => now - t < 60_000)) this.rateMap.delete(key)
      }
    }
    return true
  }

  /**
   * 埋点上报（PRD 4.6.3）
   * - 事件类型白名单
   * - E01 五来源白名单 + refId 必填 ≤32
   * - E01 同 session+source+refId 5 分钟去重（返回已有 eventId）
   * - 单会话 60 次/分钟限流（超限返回 eventId=0 并记警告）
   */
  async report(
    payload: AssessmentEventPayload,
    authUserId?: number
  ): Promise<{ eventId: number }> {
    const eventType = String(payload.eventType || '')
    if (
      !ASSESSMENT_EVENT_TYPES.includes(
        eventType as (typeof ASSESSMENT_EVENT_TYPES)[number]
      )
    ) {
      throw new BadRequestException('不支持的事件类型')
    }

    const sessionId = String(payload.sessionId || '').slice(0, 64)
    if (!sessionId) {
      throw new BadRequestException('缺少 sessionId')
    }

    const source = payload.source ? String(payload.source) : null
    const refId = payload.refId ? String(payload.refId) : null

    if (eventType === 'channel_visit') {
      if (
        !source ||
        !CHANNEL_SOURCES.includes(source as (typeof CHANNEL_SOURCES)[number])
      ) {
        throw new BadRequestException('非法的渠道来源')
      }
      if (!refId) {
        throw new BadRequestException('缺少渠道暗标识')
      }
      if (refId.length > 32) {
        throw new BadRequestException('渠道暗标识过长')
      }

      // L1 去重：同会话 + 同来源 + 同暗标识，5 分钟内仅落一条
      const exist = await this.prisma.client.assessmentEvent.findFirst({
        where: {
          eventType: 'channel_visit',
          sessionId,
          source,
          refId,
          createdAt: { gte: new Date(Date.now() - EVENT_DEDUP_WINDOW_MS) }
        },
        select: { id: true }
      })
      if (exist) {
        return { eventId: Number(exist.id) }
      }
    }

    if (!this.checkRateLimit(sessionId)) {
      console.warn(`[assessment] 埋点上报超频已丢弃 sessionId=${sessionId}`)
      return { eventId: 0 }
    }

    let surveyId = this.toNumber(payload.surveyId)
    const surveyResponseId = this.toNumber(payload.surveyResponseId)
    // E03 未携带 surveyId 时从答卷补齐，保证看板单测评归因
    if (!surveyId && surveyResponseId) {
      const response = await this.prisma.client.surveyResponse.findUnique({
        where: { id: BigInt(surveyResponseId) },
        select: { surveyId: true }
      })
      if (response) surveyId = Number(response.surveyId)
    }

    const userId = authUserId || this.toNumber(payload.userId)

    const created = await this.prisma.client.assessmentEvent.create({
      data: {
        eventType,
        userId: userId ? BigInt(userId) : null,
        sessionId,
        source,
        refId,
        target: payload.target ? String(payload.target).slice(0, 16) : null,
        position: payload.position
          ? String(payload.position).slice(0, 32)
          : null,
        surveyId: surveyId ? BigInt(surveyId) : null,
        surveyResponseId: surveyResponseId
          ? BigInt(surveyResponseId)
          : null,
        isNewUser: payload.isNewUser ? 1 : 0,
        userAgent: payload.userAgent
          ? String(payload.userAgent).slice(0, 255)
          : null,
        createdDay: this.todayDateOnly()
      },
      select: { id: true }
    })

    return { eventId: Number(created.id) }
  }
}
