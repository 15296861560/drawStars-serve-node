import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PointsService } from '../points/points.service'
import {
  ASSESSMENT_POINTS,
  POINTS_REFERENCE_TYPE,
  POINTS_RULE_DESCRIPTION,
  type PointsScenario
} from './assessment.constants'

export interface GrantResult {
  granted: boolean
  points: number
  reason?: string
  pointsDetail: number[]
}

export interface ClaimResult {
  claimed: boolean
  grantedPoints: number
  pointsDetail: number[]
}

@Injectable()
export class AssessmentPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService
  ) {}

  private assertScenario(scenario: string): PointsScenario {
    if (!(scenario in ASSESSMENT_POINTS)) {
      throw new BadRequestException('不支持的积分场景')
    }
    return scenario as PointsScenario
  }

  /** 解析幂等键：完成→答卷、海报→事件、注册→用户 */
  private resolveReference(
    scenario: PointsScenario,
    payload: { responseId?: string | number; eventId?: number | string },
    userId: number
  ): string {
    if (scenario === 'ASSESSMENT_POSTER') {
      if (payload.eventId === undefined || payload.eventId === null || payload.eventId === '') {
        throw new BadRequestException('缺少海报事件ID')
      }
      return String(payload.eventId)
    }
    if (scenario === 'ASSESSMENT_COMPLETE') {
      if (payload.responseId === undefined || payload.responseId === null || payload.responseId === '') {
        throw new BadRequestException('缺少答卷ID')
      }
      return String(payload.responseId)
    }
    return String(userId)
  }

  /** 查询已有发放流水（幂等判定） */
  private async findGranted(
    userId: number,
    referenceType: string,
    referenceId: string
  ): Promise<{ points: number } | null> {
    const tx = await this.prisma.client.pointsTransaction.findFirst({
      where: {
        userId: BigInt(userId),
        source: 'assessment',
        referenceType,
        referenceId,
        status: 'COMPLETED'
      },
      select: { points: true }
    })
    return tx ? { points: tx.points } : null
  }

  /** 校验答卷归属（允许游客答卷，但不可冒领他人答卷） */
  private async assertResponseOwnership(responseId: string, userId: number) {
    const id = Number(responseId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('答卷ID不合法')
    }
    const response = await this.prisma.client.surveyResponse.findUnique({
      where: { id: BigInt(id) },
      select: { userId: true }
    })
    if (!response) {
      throw new BadRequestException('答卷不存在')
    }
    if (response.userId != null && Number(response.userId) !== userId) {
      throw new BadRequestException('无权领取该答卷积分')
    }
  }

  /**
   * 积分发放（场景 A 完成 / 场景 C 海报 / 新人礼）
   * 幂等键 = source=assessment + referenceType + referenceId
   */
  async grant(
    scenarioInput: string,
    payload: { responseId?: string | number; eventId?: number | string },
    userId: number
  ): Promise<GrantResult> {
    const scenario = this.assertScenario(scenarioInput)
    const referenceType = POINTS_REFERENCE_TYPE[scenario]
    const referenceId = this.resolveReference(scenario, payload, userId)

    if (scenario === 'ASSESSMENT_COMPLETE') {
      await this.assertResponseOwnership(referenceId, userId)
    }

    const existed = await this.findGranted(userId, referenceType, referenceId)
    if (existed) {
      return {
        granted: false,
        points: 0,
        reason: '已领取过',
        pointsDetail: []
      }
    }

    const points = ASSESSMENT_POINTS[scenario]
    try {
      await this.pointsService.operatePoints({
        userId,
        points,
        source: 'assessment',
        referenceId,
        referenceType,
        ruleCode: scenario,
        description: POINTS_RULE_DESCRIPTION[scenario],
        immediate: true,
        extra: { scenario }
      })
    } catch (error) {
      if (error instanceof BadRequestException) {
        return {
          granted: false,
          points: 0,
          reason: error.message,
          pointsDetail: []
        }
      }
      throw error
    }

    return { granted: true, points, pointsDetail: [points] }
  }

  /**
   * 补领校验/补发（场景 B：注册链路）
   * 已发放返回 claimed=true；本次新发放返回 claimed=false（与前端 mock 口径一致）
   */
  async claim(
    scenarioInput: string,
    responseId: string | undefined,
    userId: number
  ): Promise<ClaimResult> {
    const scenario = this.assertScenario(scenarioInput)
    const referenceType = POINTS_REFERENCE_TYPE[scenario]

    if (scenario !== 'ASSESSMENT_COMPLETE') {
      throw new BadRequestException('该场景不支持补领')
    }
    if (!responseId) {
      throw new BadRequestException('缺少答卷ID')
    }

    await this.assertResponseOwnership(responseId, userId)
    const existed = await this.findGranted(userId, referenceType, responseId)
    if (existed) {
      return {
        claimed: true,
        grantedPoints: existed.points,
        pointsDetail: [existed.points]
      }
    }

    const result = await this.grant(scenario, { responseId }, userId)
    return {
      claimed: false,
      grantedPoints: result.points,
      pointsDetail: result.pointsDetail
    }
  }
}
