import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ScoringService } from './scoring.service'
import { AuthInfo, asRecord, tryResolveUserId } from './survey.util'

@Injectable()
export class FillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ScoringService
  ) {}

  async getFillByShareCode(
    shareCode: string,
    query: { password?: string; source?: string } = {}
  ) {
    const pub = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { shareCode },
      include: {
        survey: {
          include: {
            questions: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              include: { options: { orderBy: { sortOrder: 'asc' } } }
            },
            logicRules: { orderBy: { sortOrder: 'asc' } }
          }
        }
      }
    })
    if (!pub || pub.survey.deletedAt) {
      throw new NotFoundException('问卷不存在或已删除')
    }

    const survey = pub.survey
    if (survey.status === 'paused') {
      throw new BadRequestException('问卷已暂停填写')
    }
    if (survey.status === 'closed' || survey.status === 'draft') {
      throw new BadRequestException('问卷当前不可填写')
    }
    if (survey.status !== 'published') {
      throw new BadRequestException('问卷未开放填写')
    }
    if (pub.publishTime && pub.publishTime.getTime() > Date.now()) {
      throw new BadRequestException('问卷尚未到发布时间')
    }
    if (pub.expireTime && pub.expireTime.getTime() < Date.now()) {
      throw new BadRequestException('问卷已过期')
    }

    await this.prisma.client.surveyPublishConfig.update({
      where: { id: pub.id },
      data: { clickCount: { increment: 1 } }
    })

    const needPassword = Boolean(pub.accessPassword)
    const passwordOk =
      !needPassword ||
      (query.password != null &&
        String(query.password) === String(pub.accessPassword))

    const base = {
      id: Number(survey.id),
      title: survey.title,
      description: survey.description,
      type: survey.type,
      status: survey.status,
      coverImage: survey.coverImage,
      themeConfig: survey.themeConfig,
      settings: survey.settings,
      scoringEnabled: survey.scoringEnabled,
      shareCode,
      needPassword,
      requireLogin: pub.requireLogin,
      minDuration: pub.minDuration,
      clickCount: pub.clickCount + 1
    }

    if (!passwordOk) {
      return {
        ...base,
        unlocked: false,
        questions: [],
        logicRules: [],
        msg: '需要访问密码'
      }
    }

    return {
      ...base,
      unlocked: true,
      questions: survey.questions.map(q => ({
        id: Number(q.id),
        type: q.type,
        title: q.title,
        description: q.description,
        sortOrder: q.sortOrder,
        pageIndex: q.pageIndex,
        required: q.required,
        config: this.stripAdminScoring(q.config),
        extra: q.extra,
        options: q.options.map(o => ({
          id: Number(o.id),
          content: o.content,
          sortOrder: o.sortOrder,
          isOther: o.isOther,
          config: o.config
        }))
      })),
      logicRules: survey.logicRules.map(r => ({
        id: Number(r.id),
        sourceQuestionId: Number(r.sourceQuestionId),
        condition: r.condition,
        actionType: r.actionType,
        targetQuestionId: r.targetQuestionId
          ? Number(r.targetQuestionId)
          : null,
        targetPage: r.targetPage,
        sortOrder: r.sortOrder
      }))
    }
  }

  private stripAdminScoring(config: unknown) {
    const cfg = asRecord(config)
    if (!cfg.scoring) return config
    const scoring = asRecord(cfg.scoring)
    // hide correct answers on fill page
    const { correct_answer: _c, ...rest } = scoring
    return { ...cfg, scoring: { ...rest, hasScoring: true } }
  }

  async verifyPassword(shareCode: string, password: string) {
    const pub = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { shareCode }
    })
    if (!pub) throw new NotFoundException('问卷不存在')
    const ok =
      !pub.accessPassword || String(password) === String(pub.accessPassword)
    if (!ok) throw new ForbiddenException('密码错误')
    return { ok: true }
  }

  private async getPublishOrThrow(surveyId: number) {
    const survey = await this.prisma.client.survey.findFirst({
      where: { id: BigInt(surveyId), deletedAt: null },
      include: { publishConfig: true }
    })
    if (!survey) throw new NotFoundException('问卷不存在')
    if (!survey.publishConfig) {
      throw new BadRequestException('问卷未发布')
    }
    if (survey.status !== 'published') {
      throw new BadRequestException('问卷当前不可提交')
    }
    return survey
  }

  private async assertAntiCheat(
    surveyId: bigint,
    pub: {
      maxResponses: number | null
      limitPerUser: number
      requireLogin: string
      accessPassword: string | null
      ipLimit: number
      deviceLimit: number
      minDuration: number
      whitelist: unknown
      expireTime: Date | null
    },
    opts: {
      userId: number | null
      ip: string | null
      deviceFingerprint: string | null
      password?: string
      duration?: number
      forSubmit?: boolean
    }
  ) {
    if (pub.expireTime && pub.expireTime.getTime() < Date.now()) {
      throw new BadRequestException('问卷已截止')
    }
    if (pub.accessPassword) {
      if (String(opts.password || '') !== String(pub.accessPassword)) {
        throw new ForbiddenException('访问密码错误')
      }
    }
    if (pub.requireLogin === 'required' && !opts.userId) {
      throw new ForbiddenException('需要登录后填写')
    }

    const whitelist = pub.whitelist
    if (Array.isArray(whitelist) && whitelist.length > 0 && opts.userId) {
      const ids = whitelist.map(v => Number(v))
      if (!ids.includes(opts.userId)) {
        throw new ForbiddenException('不在填写白名单中')
      }
    }

    if (pub.maxResponses != null && pub.maxResponses > 0) {
      const count = await this.prisma.client.surveyResponse.count({
        where: { surveyId, status: 'submitted' }
      })
      if (count >= pub.maxResponses) {
        throw new BadRequestException('已达到最大回收份数')
      }
    }

    if (opts.userId && pub.limitPerUser > 0) {
      const count = await this.prisma.client.surveyResponse.count({
        where: {
          surveyId,
          userId: BigInt(opts.userId),
          status: 'submitted'
        }
      })
      if (count >= pub.limitPerUser) {
        throw new BadRequestException('已超过每人填写次数限制')
      }
    }

    if (opts.ip && pub.ipLimit > 0) {
      const count = await this.prisma.client.surveyResponse.count({
        where: { surveyId, ip: opts.ip, status: 'submitted' }
      })
      if (count >= pub.ipLimit) {
        throw new BadRequestException('该 IP 填写次数已达上限')
      }
    }

    if (opts.deviceFingerprint && pub.deviceLimit > 0) {
      const count = await this.prisma.client.surveyResponse.count({
        where: {
          surveyId,
          deviceFingerprint: opts.deviceFingerprint,
          status: 'submitted'
        }
      })
      if (count >= pub.deviceLimit) {
        throw new BadRequestException('该设备填写次数已达上限')
      }
    }

    return pub.minDuration || 0
  }

  private isAnswerEmpty(a?: Record<string, unknown> | null): boolean {
    if (!a) return true
    const hasText =
      (a.textContent != null && String(a.textContent).trim() !== '') ||
      (a.text != null && String(a.text).trim() !== '')
    const raw =
      a.answerData !== undefined
        ? a.answerData
        : a.value !== undefined
          ? a.value
          : undefined
    if (raw === undefined || raw === null) return !hasText
    if (typeof raw === 'string') {
      return raw.trim() === '' && !hasText
    }
    if (Array.isArray(raw)) {
      return raw.length === 0 && !hasText
    }
    if (typeof raw === 'object') {
      const data = asRecord(raw)
      if ('value' in data || 'values' in data) {
        const v = data.value !== undefined ? data.value : data.values
        if (v === undefined || v === null) return !hasText
        if (typeof v === 'string') return v.trim() === '' && !hasText
        if (Array.isArray(v)) return v.length === 0 && !hasText
      }
      // non-empty object counts as answered
      if (Object.keys(data).length === 0) return !hasText
    }
    return false
  }

  private async assertRequiredAnswers(
    surveyId: bigint,
    answers: Array<Record<string, unknown>>
  ) {
    const questions = await this.prisma.client.surveyQuestion.findMany({
      where: { surveyId, required: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, sortOrder: true }
    })
    if (!questions.length) return

    const byQid = new Map<number, Record<string, unknown>>()
    for (const a of answers) {
      const qid = Number(a.questionId)
      if (Number.isFinite(qid)) byQid.set(qid, a)
    }

    for (const q of questions) {
      const a = byQid.get(Number(q.id))
      if (this.isAnswerEmpty(a)) {
        throw new BadRequestException(
          `必填题未作答：${q.title || `题目${q.sortOrder + 1}`}（ID:${Number(q.id)}）`
        )
      }
    }
  }

  async submitResponse(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>,
    meta: { ip?: string | null } = {}
  ) {
    const survey = await this.getPublishOrThrow(surveyId)
    const pub = survey.publishConfig!
    const userId = tryResolveUserId(auth, body.userId as string | number)
    const ip = meta.ip || (body.ip != null ? String(body.ip) : null)
    const deviceFingerprint =
      body.deviceFingerprint != null ? String(body.deviceFingerprint) : null
    const duration = Number(body.duration || 0)
    const answers = Array.isArray(body.answers)
      ? (body.answers as Array<Record<string, unknown>>)
      : []

    const minDuration = await this.assertAntiCheat(survey.id, pub, {
      userId,
      ip,
      deviceFingerprint,
      password: body.password != null ? String(body.password) : undefined,
      duration,
      forSubmit: true
    })

    let isValid = true
    let invalidReason: string | null = null
    // PRD: auto-mark invalid when duration missing / zero / below min
    if (
      minDuration > 0 &&
      (!Number.isFinite(duration) || duration === 0 || duration < minDuration)
    ) {
      isValid = false
      invalidReason = '填写时长过短'
    }

    await this.assertRequiredAnswers(survey.id, answers)

    const draftId = body.responseId != null ? Number(body.responseId) : null
    let attemptNumber = 1
    if (userId) {
      const prev = await this.prisma.client.surveyResponse.count({
        where: {
          surveyId: survey.id,
          userId: BigInt(userId),
          status: 'submitted'
        }
      })
      attemptNumber = prev + 1
    }

    const response = await this.prisma.client.$transaction(async tx => {
      let row
      if (draftId) {
        const existing = await tx.surveyResponse.findFirst({
          where: {
            id: BigInt(draftId),
            surveyId: survey.id,
            status: 'draft'
          }
        })
        if (existing) {
          await tx.surveyAnswer.deleteMany({
            where: { responseId: existing.id }
          })
          row = await tx.surveyResponse.update({
            where: { id: existing.id },
            data: {
              status: 'submitted',
              isValid,
              invalidReason,
              duration,
              ip,
              deviceInfo:
                (body.deviceInfo as Prisma.InputJsonValue) ?? undefined,
              deviceFingerprint,
              source: body.source != null ? String(body.source) : null,
              attemptNumber,
              draftData: Prisma.DbNull,
              submittedAt: new Date(),
              userId: userId != null ? BigInt(userId) : existing.userId
            }
          })
        }
      }
      if (!row) {
        row = await tx.surveyResponse.create({
          data: {
            surveyId: survey.id,
            userId: userId != null ? BigInt(userId) : null,
            status: 'submitted',
            isValid,
            invalidReason,
            duration,
            ip,
            deviceInfo: (body.deviceInfo as Prisma.InputJsonValue) ?? undefined,
            deviceFingerprint,
            source: body.source != null ? String(body.source) : null,
            attemptNumber,
            submittedAt: new Date()
          }
        })
      }

      for (const a of answers) {
        const qid = Number(a.questionId)
        if (!Number.isFinite(qid)) continue
        await tx.surveyAnswer.create({
          data: {
            responseId: row.id,
            questionId: BigInt(qid),
            answerData: (a.answerData ??
              a.value ??
              {}) as Prisma.InputJsonValue,
            textContent:
              a.textContent != null
                ? String(a.textContent)
                : a.text != null
                  ? String(a.text)
                  : null
          }
        })
      }
      return row
    })

    let scoringResult: Awaited<ReturnType<ScoringService['gradeResponse']>> =
      null
    if (survey.scoringEnabled) {
      scoringResult = await this.scoringService.gradeResponse(
        Number(response.id)
      )
    }

    return {
      responseId: Number(response.id),
      status: response.status,
      isValid: response.isValid,
      invalidReason: response.invalidReason,
      submittedAt: response.submittedAt?.toISOString() ?? null,
      scoringResult
    }
  }

  async saveDraft(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>,
    meta: { ip?: string | null } = {}
  ) {
    const survey = await this.getPublishOrThrow(surveyId)
    const userId = tryResolveUserId(auth, body.userId as string | number)
    const draftId = body.responseId != null ? Number(body.responseId) : null
    const draftData = {
      answers: body.answers ?? [],
      currentPage: body.currentPage ?? 1,
      updatedAt: new Date().toISOString()
    }

    if (draftId) {
      const existing = await this.prisma.client.surveyResponse.findFirst({
        where: {
          id: BigInt(draftId),
          surveyId: survey.id,
          status: 'draft'
        }
      })
      if (existing) {
        const row = await this.prisma.client.surveyResponse.update({
          where: { id: existing.id },
          data: {
            draftData: draftData as Prisma.InputJsonValue,
            ip: meta.ip || existing.ip,
            deviceFingerprint:
              body.deviceFingerprint != null
                ? String(body.deviceFingerprint)
                : existing.deviceFingerprint,
            deviceInfo:
              (body.deviceInfo as Prisma.InputJsonValue) ??
              (existing.deviceInfo as Prisma.InputJsonValue) ??
              undefined,
            source: body.source != null ? String(body.source) : existing.source,
            userId: userId != null ? BigInt(userId) : existing.userId
          }
        })
        return {
          responseId: Number(row.id),
          status: 'draft',
          draftData: row.draftData
        }
      }
    }

    const row = await this.prisma.client.surveyResponse.create({
      data: {
        surveyId: survey.id,
        userId: userId != null ? BigInt(userId) : null,
        status: 'draft',
        draftData: draftData as Prisma.InputJsonValue,
        ip: meta.ip || null,
        deviceFingerprint:
          body.deviceFingerprint != null
            ? String(body.deviceFingerprint)
            : null,
        deviceInfo: (body.deviceInfo as Prisma.InputJsonValue) ?? undefined,
        source: body.source != null ? String(body.source) : null
      }
    })

    return {
      responseId: Number(row.id),
      status: 'draft',
      draftData: row.draftData
    }
  }

  async getDraft(
    surveyId: number,
    auth: AuthInfo | undefined,
    query: { userId?: string | number; responseId?: string | number } = {}
  ) {
    const survey = await this.prisma.client.survey.findFirst({
      where: { id: BigInt(surveyId), deletedAt: null }
    })
    if (!survey) throw new NotFoundException('问卷不存在')

    if (query.responseId != null && String(query.responseId) !== '') {
      const byId = await this.prisma.client.surveyResponse.findFirst({
        where: {
          id: BigInt(Number(query.responseId)),
          surveyId: survey.id,
          status: 'draft'
        }
      })
      if (!byId) throw new NotFoundException('暂存答卷不存在')
      return {
        responseId: Number(byId.id),
        surveyId: Number(byId.surveyId),
        status: byId.status,
        draftData: byId.draftData,
        updatedAt: byId.updatedAt.toISOString()
      }
    }

    const userId = tryResolveUserId(auth, query.userId)
    if (!userId) {
      throw new BadRequestException('缺少 userId 或 responseId')
    }

    const row = await this.prisma.client.surveyResponse.findFirst({
      where: {
        surveyId: survey.id,
        userId: BigInt(userId),
        status: 'draft'
      },
      orderBy: { updatedAt: 'desc' }
    })
    if (!row) {
      return {
        responseId: null,
        surveyId: Number(survey.id),
        status: 'draft',
        draftData: null,
        updatedAt: null
      }
    }
    return {
      responseId: Number(row.id),
      surveyId: Number(row.surveyId),
      status: row.status,
      draftData: row.draftData,
      updatedAt: row.updatedAt.toISOString()
    }
  }

  async getDraftByShareCode(
    shareCode: string,
    auth: AuthInfo | undefined,
    query: { userId?: string | number; responseId?: string | number } = {}
  ) {
    const pub = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { shareCode }
    })
    if (!pub) throw new NotFoundException('问卷不存在')
    return this.getDraft(Number(pub.surveyId), auth, query)
  }
}
