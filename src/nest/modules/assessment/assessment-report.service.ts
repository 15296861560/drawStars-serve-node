import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ASSESSMENT_TYPE_REGISTRY,
  M0_GRADE_MAP,
  M1_DIMENSIONS,
  M2_DIMENSIONS,
  M2_PROFILE_TITLES,
  type JudgeModel
} from './assessment.constants'

export interface ReportDimension {
  key: string
  name: string
  symbol?: string
  score: number
  max: number
  percent: number
  description?: string
  color?: string
}

export interface AssessmentReport {
  responseId: string
  surveyId: number | string
  shareCode?: string
  typeKey: string
  judgeModel: JudgeModel
  infoTitle: string
  resultTitle: string
  gradeLabel?: string
  gradeColor?: string
  totalScore?: number
  maxScore?: number
  isPassed?: boolean | null
  dimensions?: ReportDimension[]
  topDimension?: ReportDimension
  lowDimension?: ReportDimension
  summaryText?: string
  brightSide?: string[]
  blindSide?: string[]
  adviceText?: string
  responseNo?: string
  completedAt?: string
  fillUrl?: string
}

/** FNV-1a 32 位哈希，与前端 mock 保持同一算法 */
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pad(n: number, len = 5): string {
  return String(n).padStart(len, '0')
}

@Injectable()
export class AssessmentReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** 解析答案中的选项 id（兼容单值/数组/{value|id}） */
  private normalizeOptionIds(value: unknown): string[] {
    if (value === null || value === undefined) return []
    if (Array.isArray(value)) return value.flatMap(v => this.normalizeOptionIds(v))
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const inner = obj.value ?? obj.id ?? obj.optionId
      return inner === null || inner === undefined ? [] : [String(inner)]
    }
    return [String(value)]
  }

  /** 从 scoring_result.detail 中提取维度（规则引擎回退口径） */
  private extractRuleDimensions(detail: unknown): ReportDimension[] {
    if (!detail) return []
    const raw = Array.isArray(detail)
      ? detail
      : Array.isArray((detail as Record<string, unknown>).dimensions)
        ? ((detail as Record<string, unknown>).dimensions as unknown[])
        : []
    const result: ReportDimension[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const name = String(row.name ?? row.dim ?? row.key ?? '')
      if (!name) continue
      const score = Number(row.score ?? row.value ?? 0)
      const max = Number(row.maxScore ?? row.max ?? 0) || 1
      result.push({
        key: String(row.key ?? row.dim ?? name),
        name,
        score,
        max,
        percent: Math.min(100, Math.round((score / max) * 100))
      })
    }
    return result
  }

  /**
   * 报告聚合（PRD 4.2）
   * M0 等级映射 / M1 八型最高维胜出 / M2 四维得分 + 高低维点评
   */
  async build(responseId: string): Promise<AssessmentReport | null> {
    const id = Number(responseId)
    if (!Number.isFinite(id) || id <= 0) return null

    const response = await this.prisma.client.surveyResponse.findUnique({
      where: { id: BigInt(id) },
      include: {
        survey: {
          include: {
            publishConfig: true,
            questions: { include: { options: true } }
          }
        },
        answers: true,
        scoringResult: true
      }
    })
    if (!response) return null

    const info = await this.prisma.client.assessmentInfo.findFirst({
      where: { surveyId: response.surveyId },
      orderBy: { id: 'desc' }
    })
    const fallbackType = 'archetype'
    const typeKey =
      info?.typeKey && ASSESSMENT_TYPE_REGISTRY[info.typeKey]
        ? info.typeKey
        : fallbackType
    const typeDef = ASSESSMENT_TYPE_REGISTRY[typeKey]
    const judgeModel = typeDef.judgeModel

    const shareCode = response.survey?.publishConfig?.shareCode || ''
    const origin = (process.env.ASSESSMENT_H5_ORIGIN || '').replace(/\/+$/, '')
    const completedAt = response.submittedAt || response.createdAt
    const yy = String(completedAt.getFullYear()).slice(2)
    const mm = String(completedAt.getMonth() + 1).padStart(2, '0')
    const dd = String(completedAt.getDate()).padStart(2, '0')
    const responseNo = `${yy}${mm}${dd}-${pad(hash(String(responseId)) % 100000)}`

    const base = {
      responseId: String(responseId),
      surveyId: Number(response.surveyId),
      shareCode,
      typeKey,
      judgeModel,
      infoTitle: info?.title || typeDef.fullName,
      responseNo,
      completedAt: completedAt.toISOString(),
      fillUrl: shareCode ? `${origin}/survey/fill/${shareCode}` : `${origin}/`
    }

    // ---- 维度得分：优先读取选项 config.dim / config.pts ----
    const dimScores: Record<string, number> = {}
    const dimMax: Record<string, number> = {}
    let m0Score = 0
    let hasDimConfig = false

    const questions = response.survey?.questions || []
    const optionConfigMap = new Map<string, Record<string, unknown>>()
    for (const question of questions) {
      // 每题每个维度的最大分值（用于计算百分比）
      const perQuestionMax: Record<string, number> = {}
      for (const option of question.options) {
        const cfg = (option.config as Record<string, unknown>) || {}
        const dim = cfg.dim ? String(cfg.dim) : ''
        if (dim) {
          const pts = Number(cfg.pts ?? 1)
          perQuestionMax[dim] = Math.max(perQuestionMax[dim] || 0, pts)
          optionConfigMap.set(String(option.id), cfg)
        }
      }
      for (const [dim, pts] of Object.entries(perQuestionMax)) {
        dimMax[dim] = (dimMax[dim] || 0) + pts
      }
    }

    for (const answer of response.answers) {
      const ids = this.normalizeOptionIds(answer.answerData)
      for (const optionId of ids) {
        const cfg = optionConfigMap.get(optionId)
        if (!cfg) continue
        if (cfg.dim) {
          hasDimConfig = true
          const key = String(cfg.dim)
          dimScores[key] = (dimScores[key] || 0) + Number(cfg.pts ?? 1)
        }
        if (typeof cfg.score === 'number') {
          m0Score += cfg.score
        }
      }
    }

    const buildDimension = (
      key: string,
      name: string,
      score: number,
      max: number,
      extra?: Partial<ReportDimension>
    ): ReportDimension => ({
      key,
      name,
      score,
      max: max > 0 ? max : 1,
      percent: Math.min(100, Math.round((score / (max > 0 ? max : 1)) * 100)),
      ...extra
    })

    let dimensions: ReportDimension[] = []
    if (judgeModel === 'M1') {
      dimensions = M1_DIMENSIONS.map(def =>
        buildDimension(def.key, def.name, dimScores[def.key] || 0, dimMax[def.key] || 1, {
          symbol: def.symbol,
          description: def.description
        })
      ).sort((a, b) => b.score - a.score)
    } else if (judgeModel === 'M2') {
      dimensions = M2_DIMENSIONS.map(def =>
        buildDimension(def.key, def.name, dimScores[def.key] || 0, dimMax[def.key] || 1)
      ).sort((a, b) => b.score - a.score)
    }

    // 规则引擎维度回退（问卷未配置选项 dim 时）
    if (!hasDimConfig && judgeModel !== 'M0') {
      const ruleDims = this.extractRuleDimensions(response.scoringResult?.detail)
      if (ruleDims.length) {
        dimensions = ruleDims
          .map(dim => {
            const matched =
              (judgeModel === 'M1' ? M1_DIMENSIONS : M2_DIMENSIONS).find(
                def => def.key === dim.key || def.name === dim.name
              ) || null
            return {
              ...dim,
              key: matched?.key || dim.key,
              name: matched?.name || dim.name,
              symbol: matched && 'symbol' in matched ? matched.symbol : undefined,
              description:
                matched && 'description' in matched
                  ? (matched as { description?: string }).description
                  : undefined
            }
          })
          .sort((a, b) => b.score - a.score)
      }
    }

    if (judgeModel === 'M1') {
      const top = dimensions[0]
      const def = M1_DIMENSIONS.find(d => d.key === top?.key) || M1_DIMENSIONS[0]
      return {
        ...base,
        resultTitle: def.archetypeTitle,
        gradeLabel: def.name,
        dimensions,
        topDimension: top,
        summaryText: def.archetypeSummary,
        brightSide: def.bright,
        blindSide: def.blind,
        adviceText: def.advice,
        isPassed: null
      }
    }

    if (judgeModel === 'M2') {
      const top = dimensions[0]
      const low = dimensions[dimensions.length - 1]
      const topDef =
        M2_DIMENSIONS.find(d => d.key === top?.key) || M2_DIMENSIONS[0]
      const lowDef =
        M2_DIMENSIONS.find(d => d.key === low?.key) ||
        M2_DIMENSIONS[M2_DIMENSIONS.length - 1]
      const profile =
        M2_PROFILE_TITLES[hash(String(responseId)) % M2_PROFILE_TITLES.length]
      const total = dimensions.reduce((sum, d) => sum + d.score, 0)
      const max = dimensions.reduce((sum, d) => sum + d.max, 0)
      return {
        ...base,
        resultTitle: profile,
        totalScore: total,
        maxScore: max,
        dimensions,
        topDimension: top,
        lowDimension: low,
        summaryText: `${topDef.highText}\n${lowDef.lowText}`,
        isPassed: null
      }
    }

    // ---- M0 每日一签 ----
    const score =
      m0Score > 0
        ? m0Score
        : Number(response.scoringResult?.totalScore ?? 0)
    const grade =
      M0_GRADE_MAP.find(g => score >= g.min) ||
      M0_GRADE_MAP[M0_GRADE_MAP.length - 1]
    return {
      ...base,
      resultTitle: grade.title,
      gradeLabel: grade.label,
      gradeColor: grade.color,
      totalScore: score,
      maxScore: 100,
      isPassed: null,
      summaryText: grade.summary
    }
  }
}
