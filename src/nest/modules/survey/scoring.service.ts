import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { SurveyService } from './survey.service'
import { AuthInfo, asRecord, resolveUserId, toNum } from './survey.util'

type AnswerInput = {
  questionId: number
  answerData: unknown
  textContent?: string | null
}

type ScoreDetailItem = {
  questionId: number
  type: string
  points: number
  score: number
  maxScore: number
  auto: boolean
  correct: boolean | null
  needsManual: boolean
  explanation?: string
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveyService: SurveyService
  ) {}

  private defaultConfig() {
    return {
      mode: 'auto',
      maxScore: null as number | null,
      passScore: null as number | null,
      showPassLine: true,
      visibility: 'immediate',
      showCorrectAnswer: false,
      retakeStrategy: 'highest',
      maxRetakes: 0,
      retakeCooldown: 0,
      certificateEnabled: false
    }
  }

  async getConfig(surveyId: number, auth?: AuthInfo) {
    const survey = await this.surveyService.assertSurveyAccess(surveyId, auth)
    return {
      scoringEnabled: survey.scoringEnabled,
      scoringConfig: {
        ...this.defaultConfig(),
        ...asRecord(survey.scoringConfig)
      }
    }
  }

  async putConfig(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true
    })
    const scoringEnabled =
      body.scoringEnabled !== undefined
        ? Boolean(body.scoringEnabled)
        : undefined
    const scoringConfig =
      body.scoringConfig !== undefined
        ? body.scoringConfig
        : body.config !== undefined
          ? body.config
          : body

    const survey = await this.prisma.client.survey.update({
      where: { id: BigInt(surveyId) },
      data: {
        ...(scoringEnabled !== undefined ? { scoringEnabled } : {}),
        scoringConfig: {
          ...this.defaultConfig(),
          ...asRecord(scoringConfig)
        } as Prisma.InputJsonValue
      }
    })
    return {
      scoringEnabled: survey.scoringEnabled,
      scoringConfig: survey.scoringConfig
    }
  }

  async getRules(surveyId: number, auth?: AuthInfo) {
    const survey = await this.surveyService.assertSurveyAccess(surveyId, auth)
    const rules = survey.scoringRules ?? { rules: [] }
    return rules
  }

  async putRules(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true
    })
    const rules =
      body.rules != null
        ? body
        : body.scoringRules != null
          ? body.scoringRules
          : body
    const survey = await this.prisma.client.survey.update({
      where: { id: BigInt(surveyId) },
      data: { scoringRules: rules as Prisma.InputJsonValue }
    })
    return survey.scoringRules
  }

  private getScoring(config: unknown) {
    const cfg = asRecord(config)
    return asRecord(cfg.scoring)
  }

  private extractAnswerValue(answerData: unknown): unknown {
    const data = asRecord(answerData)
    if (data.value !== undefined) return data.value
    if (data.values !== undefined) return data.values
    if (Array.isArray(answerData)) return answerData
    return answerData
  }

  gradeQuestion(
    question: {
      id: bigint | number
      type: string
      config: unknown
    },
    answer?: AnswerInput | null
  ): ScoreDetailItem {
    const scoring = this.getScoring(question.config)
    const enabled = scoring.enabled !== false
    const points = Number(scoring.points ?? 0)
    const scoringType = String(scoring.scoring_type || 'auto')
    const explanation =
      scoring.explanation != null ? String(scoring.explanation) : undefined
    const qid = Number(question.id)

    if (!enabled || points <= 0) {
      return {
        questionId: qid,
        type: question.type,
        points: 0,
        score: 0,
        maxScore: 0,
        auto: true,
        correct: null,
        needsManual: false,
        explanation
      }
    }

    if (scoringType === 'manual') {
      return {
        questionId: qid,
        type: question.type,
        points,
        score: 0,
        maxScore: points,
        auto: false,
        correct: null,
        needsManual: true,
        explanation
      }
    }

    const correctAnswer = asRecord(scoring.correct_answer)
    const answerValue = answer
      ? this.extractAnswerValue(answer.answerData)
      : undefined
    const type = question.type

    let score = 0
    let correct: boolean | null = false

    if (type === 'radio' || type === 'judge' || type === 'select') {
      const expected = correctAnswer.value
      correct = String(answerValue ?? '') === String(expected ?? '')
      score = correct ? points : 0
    } else if (type === 'checkbox') {
      const expectedRaw = correctAnswer.value ?? correctAnswer.values ?? []
      const expected = (
        Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw]
      ).map(String)
      const actual = (
        Array.isArray(answerValue)
          ? answerValue
          : answerValue != null
            ? [answerValue]
            : []
      ).map(String)
      const partial = asRecord(scoring.partial_scoring)
      const strategy = String(partial.strategy || 'half_for_missing')
      const wrongPenalty = Number(partial.wrong_penalty || 0)

      const expectedSet = new Set(expected)
      const actualSet = new Set(actual)
      const hasWrong = actual.some(v => !expectedSet.has(v))
      const missing = expected.filter(v => !actualSet.has(v))

      if (hasWrong) {
        score = Math.max(0, 0 - wrongPenalty)
        correct = false
      } else if (missing.length === 0 && actual.length === expected.length) {
        score = points
        correct = true
      } else if (strategy === 'half_for_missing' && actual.length > 0) {
        score = points / 2
        correct = false
      } else {
        score = 0
        correct = false
      }
    } else if (type === 'input' || type === 'text' || type === 'number') {
      const alternatives = [
        correctAnswer.value,
        ...(Array.isArray(correctAnswer.alternatives)
          ? correctAnswer.alternatives
          : [])
      ]
        .filter(v => v != null && String(v) !== '')
        .map(v => String(v).trim().toLowerCase())
      const text = String(answer?.textContent ?? answerValue ?? '')
        .trim()
        .toLowerCase()
      correct = alternatives.includes(text)
      score = correct ? points : 0
    } else if (type === 'sort') {
      const expected = (
        Array.isArray(correctAnswer.value)
          ? correctAnswer.value
          : Array.isArray(correctAnswer.values)
            ? correctAnswer.values
            : []
      ).map(String)
      const actual = (Array.isArray(answerValue) ? answerValue : []).map(String)
      if (expected.length === 0) {
        correct = null
        score = 0
      } else {
        let matched = 0
        const len = Math.min(expected.length, actual.length)
        for (let i = 0; i < len; i++) {
          if (expected[i] === actual[i]) matched += 1
        }
        const ratio = expected.length ? matched / expected.length : 0
        score = Math.round(points * ratio * 100) / 100
        correct = ratio === 1
      }
    } else if (
      type === 'textarea' ||
      type === 'image' ||
      type === 'upload' ||
      type === 'file'
    ) {
      return {
        questionId: qid,
        type: question.type,
        points,
        score: 0,
        maxScore: points,
        auto: false,
        correct: null,
        needsManual: true,
        explanation
      }
    } else {
      // rating/date etc: no auto answer — zero unless configured
      correct = null
      score = 0
    }

    return {
      questionId: qid,
      type: question.type,
      points,
      score,
      maxScore: points,
      auto: true,
      correct,
      needsManual: false,
      explanation
    }
  }

  private mapGrade(totalScore: number, scoringRules: unknown): string | null {
    const root = asRecord(scoringRules)
    const rules = Array.isArray(root.rules) ? root.rules : []
    const gradeRule = rules.find(r => asRecord(r).type === 'grade_mapping')
    if (!gradeRule) return null
    const ranges = asRecord(asRecord(gradeRule).config).ranges
    if (!Array.isArray(ranges)) return null
    for (const r of ranges) {
      const row = asRecord(r)
      const min = Number(row.min ?? 0)
      const max = Number(row.max ?? 100)
      if (totalScore >= min && totalScore <= max) {
        return row.label != null ? String(row.label) : null
      }
    }
    return null
  }

  private applyScoringRules(opts: {
    totalScore: number
    maxScore: number
    details: ScoreDetailItem[]
    questions: Array<{ id: bigint | number; pageIndex: number }>
    scoringRules: unknown
  }): {
    totalScore: number
    dimensions: Array<Record<string, unknown>>
    applied: Array<Record<string, unknown>>
  } {
    const root = asRecord(opts.scoringRules)
    const rules = Array.isArray(root.rules) ? root.rules : []
    let totalScore = opts.totalScore
    const dimensions: Array<Record<string, unknown>> = []
    const applied: Array<Record<string, unknown>> = []

    const qPage = new Map<number, number>()
    for (const q of opts.questions) {
      qPage.set(Number(q.id), Number(q.pageIndex ?? 1))
    }
    const detailByQ = new Map(opts.details.map(d => [d.questionId, d] as const))

    for (const raw of rules) {
      const rule = asRecord(raw)
      const type = String(rule.type || '')
      const config = asRecord(rule.config)

      if (type === 'weight') {
        const pages = asRecord(config.pages)
        const pageEntries = Object.entries(pages)
          .map(([k, v]) => ({ page: Number(k), weight: Number(v) }))
          .filter(
            e =>
              Number.isFinite(e.page) &&
              Number.isFinite(e.weight) &&
              e.weight !== 0
          )
        if (!pageEntries.length) continue

        const pageScore = new Map<number, number>()
        const pageMax = new Map<number, number>()
        for (const d of opts.details) {
          const page = qPage.get(d.questionId) ?? 1
          pageScore.set(page, (pageScore.get(page) || 0) + d.score)
          pageMax.set(page, (pageMax.get(page) || 0) + d.maxScore)
        }

        const sumWeights = pageEntries.reduce((s, e) => s + e.weight, 0)
        if (sumWeights <= 0) continue

        // Prefer proportion weights (≈1): weighted share of maxScore;
        // otherwise average of (pageScore * weight) / sumWeights
        const proportionLike = Math.abs(sumWeights - 1) < 0.05
        if (proportionLike && opts.maxScore > 0) {
          let weighted = 0
          for (const e of pageEntries) {
            const ps = pageScore.get(e.page) || 0
            const pm = pageMax.get(e.page) || 0
            const ratio = pm > 0 ? ps / pm : 0
            weighted += ratio * e.weight * opts.maxScore
          }
          totalScore = Math.round(weighted * 100) / 100
        } else {
          let sum = 0
          for (const e of pageEntries) {
            sum += (pageScore.get(e.page) || 0) * e.weight
          }
          totalScore = Math.round((sum / sumWeights) * 100) / 100
        }
        applied.push({ type, totalScore })
      } else if (type === 'bonus' || type === 'conditional_bonus') {
        const qid = Number(config.questionId)
        const points = Number(config.points ?? 0)
        if (!Number.isFinite(qid) || !Number.isFinite(points) || points === 0) {
          continue
        }
        const item = detailByQ.get(qid)
        if (item?.correct === true) {
          totalScore = Math.round((totalScore + points) * 100) / 100
          applied.push({ type, questionId: qid, points })
        }
      } else if (type === 'dimension') {
        const dims = Array.isArray(config.dimensions)
          ? config.dimensions
          : Array.isArray(config.items)
            ? config.items
            : [config]
        for (const dRaw of dims) {
          const d = asRecord(dRaw)
          const name = String(d.name || d.label || '维度')
          const qids = (
            Array.isArray(d.questionIds)
              ? d.questionIds
              : Array.isArray(d.questions)
                ? d.questions
                : []
          )
            .map(Number)
            .filter(n => Number.isFinite(n))
          if (!qids.length) continue
          const method = String(d.method || d.aggregate || 'sum')
          const scores = qids
            .map(qid => detailByQ.get(qid)?.score ?? 0)
            .filter(n => Number.isFinite(n))
          const maxes = qids.map(qid => detailByQ.get(qid)?.maxScore ?? 0)
          const sum = scores.reduce((a, b) => a + b, 0)
          const maxSum = maxes.reduce((a, b) => a + b, 0)
          const score =
            method === 'avg' || method === 'average'
              ? scores.length
                ? sum / scores.length
                : 0
              : sum
          dimensions.push({
            name,
            questionIds: qids,
            method,
            score: Math.round(score * 100) / 100,
            maxScore: Math.round(maxSum * 100) / 100
          })
        }
        if (dims.length) applied.push({ type, count: dimensions.length })
      }
      // grade_mapping applied later via mapGrade
    }

    return { totalScore, dimensions, applied }
  }

  async gradeResponse(responseId: number) {
    const response = await this.prisma.client.surveyResponse.findUnique({
      where: { id: BigInt(responseId) },
      include: {
        answers: true,
        survey: {
          include: {
            questions: true
          }
        }
      }
    })
    if (!response) throw new NotFoundException('答卷不存在')
    if (!response.survey.scoringEnabled) return null

    const answerMap = new Map(
      response.answers.map(a => [
        Number(a.questionId),
        {
          questionId: Number(a.questionId),
          answerData: a.answerData,
          textContent: a.textContent
        } as AnswerInput
      ])
    )

    const details: ScoreDetailItem[] = []
    let totalScore = 0
    let maxScore = 0
    let needsManual = false

    for (const q of response.survey.questions) {
      const item = this.gradeQuestion(q, answerMap.get(Number(q.id)))
      details.push(item)
      totalScore += item.score
      maxScore += item.maxScore
      if (item.needsManual) needsManual = true
    }

    const cfg = {
      ...this.defaultConfig(),
      ...asRecord(response.survey.scoringConfig)
    }
    if (cfg.maxScore != null && Number(cfg.maxScore) > 0) {
      maxScore = Number(cfg.maxScore)
    }

    const ruled = this.applyScoringRules({
      totalScore,
      maxScore,
      details,
      questions: response.survey.questions,
      scoringRules: response.survey.scoringRules
    })
    totalScore = ruled.totalScore

    const passScore =
      cfg.passScore != null
        ? Number(cfg.passScore)
        : Math.round(maxScore * 0.6 * 100) / 100
    const isPassed = totalScore >= passScore
    const gradeLabel = this.mapGrade(totalScore, response.survey.scoringRules)

    let certificate: Prisma.InputJsonValue | undefined
    if (isPassed && cfg.certificateEnabled) {
      certificate = {
        certNo: `SC${response.surveyId}-${responseId}-${Date.now()}`,
        surveyId: Number(response.surveyId),
        responseId,
        title: response.survey.title,
        score: totalScore,
        maxScore,
        gradeLabel,
        issuedAt: new Date().toISOString(),
        userId: toNum(response.userId)
      }
    }

    const detailPayload = {
      items: details,
      needsManual,
      dimensions: ruled.dimensions,
      appliedRules: ruled.applied
    } as Prisma.InputJsonValue

    const result = await this.prisma.client.surveyScoringResult.upsert({
      where: { responseId: BigInt(responseId) },
      create: {
        responseId: BigInt(responseId),
        surveyId: response.surveyId,
        totalScore,
        maxScore,
        passScore,
        isPassed,
        gradeLabel,
        detail: detailPayload,
        certificate: certificate ?? undefined,
        gradedAt: needsManual ? null : new Date()
      },
      update: {
        totalScore,
        maxScore,
        passScore,
        isPassed,
        gradeLabel,
        detail: detailPayload,
        certificate: certificate ?? undefined,
        gradedAt: needsManual ? null : new Date()
      }
    })

    await this.updateRanking(Number(response.surveyId))
    return this.mapResult(result)
  }

  async updateRanking(surveyId: number) {
    const results = await this.prisma.client.surveyScoringResult.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: [{ totalScore: 'desc' }, { createdAt: 'asc' }]
    })
    await this.prisma.client.$transaction(
      results.map((r, idx) =>
        this.prisma.client.surveyScoringResult.update({
          where: { id: r.id },
          data: { rank: idx + 1 }
        })
      )
    )
  }

  private mapResult(r: {
    id: bigint
    responseId: bigint
    surveyId: bigint
    totalScore: Prisma.Decimal | number
    maxScore: Prisma.Decimal | number
    passScore: Prisma.Decimal | number
    isPassed: boolean
    gradeLabel: string | null
    rank: number | null
    detail: unknown
    certificate: unknown
    gradedBy: bigint | null
    gradedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: Number(r.id),
      responseId: Number(r.responseId),
      surveyId: Number(r.surveyId),
      totalScore: Number(r.totalScore),
      maxScore: Number(r.maxScore),
      passScore: Number(r.passScore),
      isPassed: r.isPassed,
      gradeLabel: r.gradeLabel,
      rank: r.rank,
      detail: r.detail,
      certificate: r.certificate,
      gradedBy: toNum(r.gradedBy),
      gradedAt: r.gradedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }
  }

  async listResults(
    surveyId: number,
    auth: AuthInfo | undefined,
    query: Record<string, string>
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
    const where: Prisma.SurveyScoringResultWhereInput = {
      surveyId: BigInt(surveyId)
    }
    if (query.passed === '1' || query.passed === 'true') where.isPassed = true
    if (query.passed === '0' || query.passed === 'false') where.isPassed = false
    if (query.keyword) {
      // filter via response id if numeric
      const n = Number(query.keyword)
      if (Number.isFinite(n)) where.responseId = BigInt(n)
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.surveyScoringResult.count({ where }),
      this.prisma.client.surveyScoringResult.findMany({
        where,
        orderBy: [{ totalScore: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])

    return {
      list: rows.map(r => this.mapResult(r)),
      total,
      page,
      pageSize
    }
  }

  async getResultByResponseId(
    surveyId: number,
    responseId: number,
    auth?: AuthInfo
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const row = await this.prisma.client.surveyScoringResult.findFirst({
      where: {
        surveyId: BigInt(surveyId),
        responseId: BigInt(responseId)
      }
    })
    if (!row) throw new NotFoundException('评分结果不存在')
    return this.mapResult(row)
  }

  async getResultByResponseIdPublic(responseId: number) {
    const row = await this.prisma.client.surveyScoringResult.findUnique({
      where: { responseId: BigInt(responseId) },
      include: { survey: true }
    })
    if (!row) throw new NotFoundException('评分结果不存在')
    const cfg = {
      ...this.defaultConfig(),
      ...asRecord(row.survey.scoringConfig)
    }
    if (cfg.visibility === 'admin_only') {
      return {
        visible: false,
        message: '成绩仅管理员可见'
      }
    }
    return { visible: true, ...this.mapResult(row) }
  }

  async getFillResult(
    shareCode: string,
    query: { responseId?: string; userId?: string }
  ) {
    const pub = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { shareCode },
      include: { survey: true }
    })
    if (!pub) throw new NotFoundException('问卷不存在')

    let responseId = query.responseId ? Number(query.responseId) : null
    if (!responseId && query.userId) {
      const latest = await this.prisma.client.surveyResponse.findFirst({
        where: {
          surveyId: pub.surveyId,
          userId: BigInt(Number(query.userId)),
          status: 'submitted'
        },
        orderBy: { submittedAt: 'desc' }
      })
      responseId = latest ? Number(latest.id) : null
    }
    if (!responseId) {
      throw new BadRequestException('缺少 responseId')
    }

    const result = await this.prisma.client.surveyScoringResult.findFirst({
      where: {
        surveyId: pub.surveyId,
        responseId: BigInt(responseId)
      }
    })
    if (!result) throw new NotFoundException('暂无成绩')

    const cfg = {
      ...this.defaultConfig(),
      ...asRecord(pub.survey.scoringConfig)
    }
    if (cfg.visibility === 'admin_only') {
      return { visible: false, message: '成绩仅管理员可见' }
    }

    const mapped = this.mapResult(result)
    if (!cfg.showCorrectAnswer) {
      const detail = asRecord(mapped.detail)
      const items = Array.isArray(detail.items)
        ? detail.items.map(it => {
            const row = asRecord(it)
            return {
              questionId: row.questionId,
              score: row.score,
              maxScore: row.maxScore,
              correct: row.correct
            }
          })
        : []
      return { visible: true, ...mapped, detail: { items } }
    }
    return { visible: true, ...mapped }
  }

  async distribution(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const rows = await this.prisma.client.surveyScoringResult.findMany({
      where: { surveyId: BigInt(surveyId) }
    })
    const scores = rows.map(r => Number(r.totalScore))
    const buckets = [
      { label: '0-59', min: 0, max: 59, count: 0 },
      { label: '60-69', min: 60, max: 69, count: 0 },
      { label: '70-79', min: 70, max: 79, count: 0 },
      { label: '80-89', min: 80, max: 89, count: 0 },
      { label: '90-100', min: 90, max: 100, count: 0 },
      { label: '100+', min: 101, max: Infinity, count: 0 }
    ]
    for (const s of scores) {
      const b = buckets.find(x => s >= x.min && s <= x.max)
      if (b) b.count += 1
    }
    const avg =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const passed = rows.filter(r => r.isPassed).length
    return {
      total: rows.length,
      average: Math.round(avg * 100) / 100,
      max: scores.length ? Math.max(...scores) : 0,
      min: scores.length ? Math.min(...scores) : 0,
      passRate: rows.length ? passed / rows.length : 0,
      buckets: buckets.map(({ label, count }) => ({ label, count }))
    }
  }

  async ranking(
    surveyId: number,
    auth: AuthInfo | undefined,
    query: Record<string, string>
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50))
    const rows = await this.prisma.client.surveyScoringResult.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: [{ totalScore: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      include: {
        response: { select: { userId: true, submittedAt: true } }
      }
    })
    return rows.map((r, idx) => ({
      ...this.mapResult(r),
      rank: r.rank ?? idx + 1,
      userId: toNum(r.response.userId),
      submittedAt: r.response.submittedAt?.toISOString() ?? null
    }))
  }

  async itemAnalysis(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const questions = await this.prisma.client.surveyQuestion.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: { sortOrder: 'asc' }
    })
    const results = await this.prisma.client.surveyScoringResult.findMany({
      where: { surveyId: BigInt(surveyId) }
    })

    const sorted = [...results].sort(
      (a, b) => Number(b.totalScore) - Number(a.totalScore)
    )
    const highCut = Math.ceil(sorted.length * 0.27)
    const highIds = new Set(
      sorted.slice(0, highCut).map(r => Number(r.responseId))
    )
    const lowIds = new Set(
      sorted.slice(-highCut).map(r => Number(r.responseId))
    )

    return questions.map(q => {
      let correct = 0
      let highCorrect = 0
      let lowCorrect = 0
      let scored = 0
      for (const r of results) {
        const detail = asRecord(r.detail)
        const items = Array.isArray(detail.items) ? detail.items : []
        const item = items.find(
          it => Number(asRecord(it).questionId) === Number(q.id)
        )
        if (!item) continue
        scored += 1
        const row = asRecord(item)
        if (row.correct === true) {
          correct += 1
          if (highIds.has(Number(r.responseId))) highCorrect += 1
          if (lowIds.has(Number(r.responseId))) lowCorrect += 1
        }
      }
      const difficulty = scored ? correct / scored : 0
      const discrimination =
        highCut > 0 ? (highCorrect - lowCorrect) / highCut : 0
      return {
        questionId: Number(q.id),
        title: q.title,
        type: q.type,
        sampleCount: scored,
        correctRate: Math.round(difficulty * 1000) / 1000,
        difficulty: Math.round(difficulty * 1000) / 1000,
        discrimination: Math.round(discrimination * 1000) / 1000
      }
    })
  }

  async gradingList(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth)
    const questions = await this.prisma.client.surveyQuestion.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: { sortOrder: 'asc' }
    })
    const manualQs = questions.filter(q => {
      const scoring = this.getScoring(q.config)
      return (
        scoring.enabled !== false &&
        (String(scoring.scoring_type) === 'manual' ||
          ['textarea', 'image', 'upload', 'file'].includes(q.type))
      )
    })

    const results = await this.prisma.client.surveyScoringResult.findMany({
      where: { surveyId: BigInt(surveyId) },
      include: {
        response: {
          include: { answers: true }
        }
      }
    })

    return manualQs.map(q => {
      const pending: Array<Record<string, unknown>> = []
      for (const r of results) {
        const detail = asRecord(r.detail)
        const items = Array.isArray(detail.items) ? detail.items : []
        const item = asRecord(
          items.find(it => Number(asRecord(it).questionId) === Number(q.id))
        )
        if (!item.needsManual && item.graded === true) continue
        const answer = r.response.answers.find(
          a => Number(a.questionId) === Number(q.id)
        )
        pending.push({
          responseId: Number(r.responseId),
          questionId: Number(q.id),
          currentScore: Number(item.score || 0),
          maxScore: Number(item.maxScore || item.points || 0),
          answerData: answer?.answerData ?? null,
          textContent: answer?.textContent ?? null,
          gradedAt: r.gradedAt?.toISOString() ?? null
        })
      }
      return {
        questionId: Number(q.id),
        title: q.title,
        type: q.type,
        pendingCount: pending.length,
        items: pending
      }
    })
  }

  async submitGrade(
    surveyId: number,
    responseId: number,
    auth: AuthInfo | undefined,
    body: {
      scores?: Array<{ questionId: number; score: number }>
      items?: Array<{ questionId: number; score: number }>
    }
  ) {
    const userId = resolveUserId(auth)
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true
    })

    const result = await this.prisma.client.surveyScoringResult.findFirst({
      where: {
        surveyId: BigInt(surveyId),
        responseId: BigInt(responseId)
      }
    })
    if (!result) throw new NotFoundException('评分结果不存在')

    const scoreList = body.scores || body.items || []
    const detail = asRecord(result.detail)
    const items = (Array.isArray(detail.items) ? detail.items : []).map(it =>
      asRecord(it)
    )

    for (const s of scoreList) {
      const idx = items.findIndex(
        it => Number(it.questionId) === Number(s.questionId)
      )
      if (idx >= 0) {
        const max = Number(items[idx].maxScore || items[idx].points || 0)
        items[idx].score = Math.max(0, Math.min(max, Number(s.score)))
        items[idx].needsManual = false
        items[idx].graded = true
        items[idx].correct =
          Number(items[idx].score) >= max && max > 0 ? true : items[idx].correct
      }
    }

    const totalScore = items.reduce((sum, it) => sum + Number(it.score || 0), 0)
    const maxScore = Number(result.maxScore)
    const passScore = Number(result.passScore)
    const isPassed = totalScore >= passScore
    const survey = await this.prisma.client.survey.findUnique({
      where: { id: BigInt(surveyId) }
    })
    const gradeLabel = this.mapGrade(totalScore, survey?.scoringRules)
    const needsManual = items.some(it => it.needsManual)

    const updated = await this.prisma.client.surveyScoringResult.update({
      where: { id: result.id },
      data: {
        totalScore,
        isPassed,
        gradeLabel,
        detail: { items, needsManual } as Prisma.InputJsonValue,
        gradedBy: BigInt(userId),
        gradedAt: new Date()
      }
    })
    await this.updateRanking(surveyId)
    return this.mapResult(updated)
  }

  async batchGrade(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: {
      questionId: number
      grades: Array<{ responseId: number; score: number }>
    }
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true
    })
    const results: Awaited<ReturnType<ScoringService['submitGrade']>>[] = []
    for (const g of body.grades || []) {
      const row = await this.submitGrade(surveyId, g.responseId, auth, {
        scores: [{ questionId: body.questionId, score: g.score }]
      })
      results.push(row)
    }
    return { count: results.length, list: results }
  }

  async reviewGrade(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: {
      responseId: number
      scores?: Array<{ questionId: number; score: number }>
      remark?: string
    }
  ) {
    const result = await this.submitGrade(surveyId, body.responseId, auth, body)
    const existing = await this.prisma.client.surveyScoringResult.findUnique({
      where: { responseId: BigInt(body.responseId) }
    })
    if (existing) {
      const detail = asRecord(existing.detail)
      detail.reviewed = true
      detail.reviewRemark = body.remark || null
      detail.reviewedAt = new Date().toISOString()
      await this.prisma.client.surveyScoringResult.update({
        where: { id: existing.id },
        data: { detail: detail as Prisma.InputJsonValue }
      })
    }
    return { ...result, reviewed: true }
  }
}
