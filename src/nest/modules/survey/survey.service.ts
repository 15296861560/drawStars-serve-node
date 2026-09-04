import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  AuthInfo,
  asRecord,
  generateShareCode,
  resolveUserId,
  toNum
} from './survey.util'

@Injectable()
export class SurveyService {
  constructor(private readonly prisma: PrismaService) {}

  private hasListPermission(auth?: AuthInfo): boolean {
    const perms = auth?.permissions || []
    const roles = auth?.roleCodes || []
    if (roles.includes('super_admin') || roles.includes('admin')) return true
    return perms.includes('survey:questionnaire:list')
  }

  async assertSurveyAccess(
    surveyId: number,
    auth?: AuthInfo,
    opts?: { write?: boolean }
  ) {
    const survey = await this.prisma.client.survey.findFirst({
      where: { id: BigInt(surveyId), deletedAt: null }
    })
    if (!survey) throw new NotFoundException('问卷不存在')

    const userId = resolveUserId(auth)
    const isOwner = Number(survey.creatorId) === userId
    if (isOwner) return survey
    if (this.hasListPermission(auth)) return survey
    throw new ForbiddenException(
      opts?.write ? '无权操作该问卷' : '无权查看该问卷'
    )
  }

  private mapSurvey(
    survey: {
      id: bigint
      title: string
      description: string | null
      type: string
      status: string
      creatorId: bigint
      coverImage: string | null
      themeConfig: unknown
      settings: unknown
      scoringEnabled: boolean
      scoringConfig: unknown
      scoringRules: unknown
      createdAt: Date
      updatedAt: Date
      deletedAt: Date | null
      publishConfig?: {
        shareCode: string
        clickCount: number
        publishTime: Date | null
        expireTime: Date | null
        maxResponses: number | null
        limitPerUser: number
        requireLogin: string
        accessPassword: string | null
        ipLimit: number
        deviceLimit: number
        minDuration: number
        whitelist: unknown
      } | null
      _count?: { responses?: number; questions?: number }
    },
    extra?: Record<string, unknown>
  ) {
    return {
      id: Number(survey.id),
      title: survey.title,
      description: survey.description,
      type: survey.type,
      status: survey.status,
      creatorId: Number(survey.creatorId),
      coverImage: survey.coverImage,
      themeConfig: survey.themeConfig,
      settings: survey.settings,
      scoringEnabled: survey.scoringEnabled,
      scoringConfig: survey.scoringConfig,
      scoringRules: survey.scoringRules,
      createdAt: survey.createdAt.toISOString(),
      updatedAt: survey.updatedAt.toISOString(),
      deletedAt: survey.deletedAt?.toISOString() ?? null,
      publishConfig: survey.publishConfig
        ? {
            shareCode: survey.publishConfig.shareCode,
            clickCount: survey.publishConfig.clickCount,
            publishTime:
              survey.publishConfig.publishTime?.toISOString() ?? null,
            expireTime: survey.publishConfig.expireTime?.toISOString() ?? null,
            maxResponses: survey.publishConfig.maxResponses,
            limitPerUser: survey.publishConfig.limitPerUser,
            requireLogin: survey.publishConfig.requireLogin,
            hasPassword: Boolean(survey.publishConfig.accessPassword),
            ipLimit: survey.publishConfig.ipLimit,
            deviceLimit: survey.publishConfig.deviceLimit,
            minDuration: survey.publishConfig.minDuration,
            whitelist: survey.publishConfig.whitelist
          }
        : null,
      responseCount: survey._count?.responses ?? undefined,
      questionCount: survey._count?.questions ?? undefined,
      ...extra
    }
  }

  private mapQuestion(q: {
    id: bigint
    surveyId: bigint
    type: string
    title: string
    description: string | null
    sortOrder: number
    pageIndex: number
    required: boolean
    config: unknown
    extra: unknown
    options?: Array<{
      id: bigint
      questionId: bigint
      content: string
      sortOrder: number
      isOther: boolean
      config: unknown
    }>
  }) {
    return {
      id: Number(q.id),
      surveyId: Number(q.surveyId),
      type: q.type,
      title: q.title,
      description: q.description,
      sortOrder: q.sortOrder,
      pageIndex: q.pageIndex,
      required: q.required,
      config: q.config,
      extra: q.extra,
      options: (q.options || []).map(o => ({
        id: Number(o.id),
        questionId: Number(o.questionId),
        content: o.content,
        sortOrder: o.sortOrder,
        isOther: o.isOther,
        config: o.config
      }))
    }
  }

  async list(
    auth: AuthInfo | undefined,
    query: {
      page?: number
      pageSize?: number
      status?: string
      keyword?: string
      type?: string
      mine?: string
    }
  ) {
    const userId = resolveUserId(auth)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
    const where: Prisma.SurveyWhereInput = { deletedAt: null }

    if (
      query.mine === '1' ||
      query.mine === 'true' ||
      !this.hasListPermission(auth)
    ) {
      where.creatorId = BigInt(userId)
    }
    if (query.status) where.status = query.status
    if (query.type) where.type = query.type
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword } },
        { description: { contains: query.keyword } }
      ]
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.survey.count({ where }),
      this.prisma.client.survey.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          publishConfig: true,
          _count: { select: { responses: true, questions: true } }
        }
      })
    ])

    return {
      list: rows.map(r => this.mapSurvey(r)),
      total,
      page,
      pageSize
    }
  }

  async create(auth: AuthInfo | undefined, body: Record<string, unknown>) {
    const userId = resolveUserId(auth)
    const title = String(body.title || '').trim()
    if (!title) throw new BadRequestException('标题不能为空')

    const survey = await this.prisma.client.survey.create({
      data: {
        title,
        description: body.description != null ? String(body.description) : null,
        type: body.type != null ? String(body.type) : 'normal',
        status: 'draft',
        creatorId: BigInt(userId),
        coverImage: body.coverImage != null ? String(body.coverImage) : null,
        themeConfig: (body.themeConfig as Prisma.InputJsonValue) ?? undefined,
        settings: (body.settings as Prisma.InputJsonValue) ?? undefined,
        scoringEnabled: Boolean(body.scoringEnabled),
        scoringConfig:
          (body.scoringConfig as Prisma.InputJsonValue) ?? undefined,
        scoringRules: (body.scoringRules as Prisma.InputJsonValue) ?? undefined
      }
    })

    return this.mapSurvey(survey)
  }

  async detail(id: number, auth?: AuthInfo) {
    await this.assertSurveyAccess(id, auth)
    const survey = await this.prisma.client.survey.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      include: {
        publishConfig: true,
        questions: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: { options: { orderBy: { sortOrder: 'asc' } } }
        },
        logicRules: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { responses: true, questions: true } }
      }
    })
    if (!survey) throw new NotFoundException('问卷不存在')

    return {
      ...this.mapSurvey(survey),
      questions: survey.questions.map(q => this.mapQuestion(q)),
      logicRules: survey.logicRules.map(r => ({
        id: Number(r.id),
        surveyId: Number(r.surveyId),
        sourceQuestionId: Number(r.sourceQuestionId),
        condition: r.condition,
        actionType: r.actionType,
        targetQuestionId: toNum(r.targetQuestionId),
        targetPage: r.targetPage,
        sortOrder: r.sortOrder
      }))
    }
  }

  async update(
    id: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const data: Prisma.SurveyUpdateInput = {}
    if (body.title != null) data.title = String(body.title).trim()
    if (body.description !== undefined) {
      data.description =
        body.description == null ? null : String(body.description)
    }
    if (body.type != null) data.type = String(body.type)
    if (body.coverImage !== undefined) {
      data.coverImage = body.coverImage == null ? null : String(body.coverImage)
    }
    if (body.themeConfig !== undefined) {
      data.themeConfig = body.themeConfig as Prisma.InputJsonValue
    }
    if (body.settings !== undefined) {
      data.settings = body.settings as Prisma.InputJsonValue
    }
    if (body.scoringEnabled !== undefined) {
      data.scoringEnabled = Boolean(body.scoringEnabled)
    }
    if (body.scoringConfig !== undefined) {
      data.scoringConfig = body.scoringConfig as Prisma.InputJsonValue
    }
    if (body.scoringRules !== undefined) {
      data.scoringRules = body.scoringRules as Prisma.InputJsonValue
    }

    const survey = await this.prisma.client.survey.update({
      where: { id: BigInt(id) },
      data,
      include: { publishConfig: true }
    })
    return this.mapSurvey(survey)
  }

  async remove(id: number, auth?: AuthInfo) {
    await this.assertSurveyAccess(id, auth, { write: true })
    await this.prisma.client.survey.update({
      where: { id: BigInt(id) },
      data: { deletedAt: new Date(), status: 'deleted' }
    })
    return true
  }

  async copy(id: number, auth?: AuthInfo) {
    const userId = resolveUserId(auth)
    const src = await this.detail(id, auth)

    const created = await this.prisma.client.$transaction(async tx => {
      const survey = await tx.survey.create({
        data: {
          title: `${src.title}（副本）`,
          description: src.description,
          type: src.type,
          status: 'draft',
          creatorId: BigInt(userId),
          coverImage: src.coverImage,
          themeConfig: (src.themeConfig as Prisma.InputJsonValue) ?? undefined,
          settings: (src.settings as Prisma.InputJsonValue) ?? undefined,
          scoringEnabled: src.scoringEnabled,
          scoringConfig:
            (src.scoringConfig as Prisma.InputJsonValue) ?? undefined,
          scoringRules: (src.scoringRules as Prisma.InputJsonValue) ?? undefined
        }
      })

      const qidMap = new Map<number, bigint>()
      for (const q of src.questions || []) {
        const nq = await tx.surveyQuestion.create({
          data: {
            surveyId: survey.id,
            type: q.type,
            title: q.title,
            description: q.description,
            sortOrder: q.sortOrder,
            pageIndex: q.pageIndex,
            required: q.required,
            config: (q.config as Prisma.InputJsonValue) ?? undefined,
            extra: (q.extra as Prisma.InputJsonValue) ?? undefined,
            options: {
              create: (q.options || []).map(o => ({
                content: o.content,
                sortOrder: o.sortOrder,
                isOther: o.isOther,
                config: (o.config as Prisma.InputJsonValue) ?? undefined
              }))
            }
          }
        })
        qidMap.set(q.id, nq.id)
      }

      for (const rule of src.logicRules || []) {
        await tx.surveyLogicRule.create({
          data: {
            surveyId: survey.id,
            sourceQuestionId:
              qidMap.get(rule.sourceQuestionId) ??
              BigInt(rule.sourceQuestionId),
            condition: rule.condition as Prisma.InputJsonValue,
            actionType: rule.actionType,
            targetQuestionId: rule.targetQuestionId
              ? (qidMap.get(rule.targetQuestionId) ??
                BigInt(rule.targetQuestionId))
              : null,
            targetPage: rule.targetPage,
            sortOrder: rule.sortOrder
          }
        })
      }

      return survey
    })

    return this.detail(Number(created.id), auth)
  }

  /** Existing DB id only — temp string ids / missing id => new question */
  private parseExistingQuestionId(id: unknown): number | null {
    if (id == null || id === '') return null
    if (typeof id === 'string' && !/^\d+$/.test(id.trim())) return null
    const n = Number(id)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  async saveQuestions(
    id: number,
    auth: AuthInfo | undefined,
    body: { questions?: Array<Record<string, unknown>> }
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const questions = Array.isArray(body.questions) ? body.questions : []

    await this.prisma.client.$transaction(async tx => {
      const existing = await tx.surveyQuestion.findMany({
        where: { surveyId: BigInt(id) },
        select: { id: true }
      })
      const existingIds = new Set(existing.map(q => Number(q.id)))
      const keepIds = new Set<number>()

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        const options = Array.isArray(q.options)
          ? (q.options as Array<Record<string, unknown>>)
          : []
        const optionCreates = options.map((o, oi) => ({
          content: String(o.content ?? o.label ?? `选项${oi + 1}`),
          sortOrder: Number(o.sortOrder ?? oi),
          isOther: Boolean(o.isOther),
          config: (o.config as Prisma.InputJsonValue) ?? undefined
        }))
        const fields = {
          type: String(q.type || 'radio'),
          title: String(q.title || `题目${i + 1}`),
          description: q.description != null ? String(q.description) : null,
          sortOrder: Number(q.sortOrder ?? i),
          pageIndex: Number(q.pageIndex ?? 1),
          required: Boolean(q.required),
          config: (q.config as Prisma.InputJsonValue) ?? undefined,
          extra: (q.extra as Prisma.InputJsonValue) ?? undefined
        }

        const qid = this.parseExistingQuestionId(q.id)
        if (qid != null && existingIds.has(qid)) {
          keepIds.add(qid)
          await tx.surveyQuestion.update({
            where: { id: BigInt(qid) },
            data: fields
          })
          // Recreate options only — keep questionId stable so answers remain
          await tx.surveyOption.deleteMany({
            where: { questionId: BigInt(qid) }
          })
          if (optionCreates.length) {
            await tx.surveyOption.createMany({
              data: optionCreates.map(o => ({
                questionId: BigInt(qid),
                ...o
              }))
            })
          }
        } else {
          const created = await tx.surveyQuestion.create({
            data: {
              surveyId: BigInt(id),
              ...fields,
              options: { create: optionCreates }
            }
          })
          keepIds.add(Number(created.id))
        }
      }

      const toDelete = existing
        .map(q => Number(q.id))
        .filter(qid => !keepIds.has(qid))
      if (toDelete.length) {
        // Cascade removes answers/options for removed questions only
        await tx.surveyQuestion.deleteMany({
          where: {
            surveyId: BigInt(id),
            id: { in: toDelete.map(qid => BigInt(qid)) }
          }
        })
      }
    })

    return this.detail(id, auth)
  }

  async sortQuestions(
    id: number,
    auth: AuthInfo | undefined,
    body: {
      orders?: Array<{ id: number; sortOrder: number; pageIndex?: number }>
    }
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const orders = Array.isArray(body.orders) ? body.orders : []
    await this.prisma.client.$transaction(
      orders.map(o =>
        this.prisma.client.surveyQuestion.updateMany({
          where: { id: BigInt(o.id), surveyId: BigInt(id) },
          data: {
            sortOrder: Number(o.sortOrder),
            ...(o.pageIndex != null ? { pageIndex: Number(o.pageIndex) } : {})
          }
        })
      )
    )
    return this.detail(id, auth)
  }

  async getLogic(id: number, auth?: AuthInfo) {
    await this.assertSurveyAccess(id, auth)
    const rules = await this.prisma.client.surveyLogicRule.findMany({
      where: { surveyId: BigInt(id) },
      orderBy: { sortOrder: 'asc' }
    })
    return rules.map(r => ({
      id: Number(r.id),
      surveyId: Number(r.surveyId),
      sourceQuestionId: Number(r.sourceQuestionId),
      condition: r.condition,
      actionType: r.actionType,
      targetQuestionId: toNum(r.targetQuestionId),
      targetPage: r.targetPage,
      sortOrder: r.sortOrder
    }))
  }

  async putLogic(
    id: number,
    auth: AuthInfo | undefined,
    body: { rules?: Array<Record<string, unknown>> }
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const rules = Array.isArray(body.rules) ? body.rules : []

    await this.prisma.client.$transaction(async tx => {
      await tx.surveyLogicRule.deleteMany({ where: { surveyId: BigInt(id) } })
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i]
        await tx.surveyLogicRule.create({
          data: {
            surveyId: BigInt(id),
            sourceQuestionId: BigInt(Number(r.sourceQuestionId)),
            condition: (r.condition as Prisma.InputJsonValue) ?? {},
            actionType: String(r.actionType || 'show'),
            targetQuestionId:
              r.targetQuestionId != null
                ? BigInt(Number(r.targetQuestionId))
                : null,
            targetPage: r.targetPage != null ? Number(r.targetPage) : null,
            sortOrder: Number(r.sortOrder ?? i)
          }
        })
      }
    })

    return this.getLogic(id, auth)
  }

  private async uniqueShareCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = generateShareCode(8)
      const exists = await this.prisma.client.surveyPublishConfig.findUnique({
        where: { shareCode: code }
      })
      if (!exists) return code
    }
    return generateShareCode(12)
  }

  async publish(
    id: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown> = {}
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const existing = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { surveyId: BigInt(id) }
    })

    const shareCode = existing?.shareCode || (await this.uniqueShareCode())
    const configData = {
      publishTime: body.publishTime
        ? new Date(String(body.publishTime))
        : existing?.publishTime || new Date(),
      expireTime: body.expireTime
        ? new Date(String(body.expireTime))
        : body.expireTime === null
          ? null
          : (existing?.expireTime ?? null),
      maxResponses:
        body.maxResponses !== undefined
          ? body.maxResponses == null
            ? null
            : Number(body.maxResponses)
          : (existing?.maxResponses ?? null),
      limitPerUser:
        body.limitPerUser !== undefined
          ? Number(body.limitPerUser)
          : (existing?.limitPerUser ?? 0),
      requireLogin:
        body.requireLogin != null
          ? String(body.requireLogin)
          : (existing?.requireLogin ?? 'none'),
      accessPassword:
        body.accessPassword !== undefined
          ? body.accessPassword
            ? String(body.accessPassword)
            : null
          : (existing?.accessPassword ?? null),
      ipLimit:
        body.ipLimit !== undefined
          ? Number(body.ipLimit)
          : (existing?.ipLimit ?? 0),
      deviceLimit:
        body.deviceLimit !== undefined
          ? Number(body.deviceLimit)
          : (existing?.deviceLimit ?? 0),
      minDuration:
        body.minDuration !== undefined
          ? Number(body.minDuration)
          : (existing?.minDuration ?? 0),
      whitelist:
        body.whitelist !== undefined
          ? (body.whitelist as Prisma.InputJsonValue)
          : ((existing?.whitelist as Prisma.InputJsonValue) ?? undefined),
      shareCode
    }

    await this.prisma.client.$transaction([
      this.prisma.client.surveyPublishConfig.upsert({
        where: { surveyId: BigInt(id) },
        create: { surveyId: BigInt(id), ...configData },
        update: configData
      }),
      this.prisma.client.survey.update({
        where: { id: BigInt(id) },
        data: { status: 'published' }
      })
    ])

    return this.detail(id, auth)
  }

  async pause(id: number, auth?: AuthInfo) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const survey = await this.prisma.client.survey.findFirst({
      where: { id: BigInt(id), deletedAt: null }
    })
    if (!survey) throw new NotFoundException('问卷不存在')
    if (survey.status !== 'published' && survey.status !== 'paused') {
      throw new BadRequestException('仅已发布问卷可暂停')
    }
    await this.prisma.client.survey.update({
      where: { id: BigInt(id) },
      data: { status: 'paused' }
    })
    return this.detail(id, auth)
  }

  async close(id: number, auth?: AuthInfo) {
    await this.assertSurveyAccess(id, auth, { write: true })
    await this.prisma.client.survey.update({
      where: { id: BigInt(id) },
      data: { status: 'closed' }
    })
    return this.detail(id, auth)
  }

  async getShareInfo(id: number, auth?: AuthInfo, opts?: { baseUrl?: string }) {
    const detail = await this.detail(id, auth)
    const cfg = detail.publishConfig
    const shareCode = cfg?.shareCode
    if (!shareCode) {
      return {
        surveyId: id,
        shareCode: null,
        fillPath: null,
        fillUrl: null,
        embedCode: null,
        qrUrl: null,
        sourceLinks: null,
        clickCount: 0,
        status: detail.status
      }
    }
    const fillPath = `/survey/fill/${shareCode}`
    const base =
      (opts?.baseUrl && String(opts.baseUrl).trim()) ||
      process.env.SURVEY_PUBLIC_BASE_URL ||
      ''
    const origin = base ? String(base).replace(/\/+$/, '') : ''
    const fillUrl = origin ? `${origin}${fillPath}` : fillPath
    const withSource = (source: string) =>
      `${fillUrl}${fillUrl.includes('?') ? '&' : '?'}source=${encodeURIComponent(source)}`
    const sourceLinks = {
      default: fillUrl,
      wechat: withSource('wechat'),
      email: withSource('email'),
      qr: withSource('qr'),
      embed: withSource('embed')
    }
    const embedCode = `<iframe src="${fillUrl}" width="100%" height="600" frameborder="0"></iframe>`
    return {
      surveyId: id,
      shareCode,
      fillPath,
      fillUrl,
      embedCode,
      qrUrl: fillUrl,
      sourceLinks,
      clickCount: cfg.clickCount || 0,
      status: detail.status,
      hasPassword: cfg.hasPassword
    }
  }

  /** 站内消息分发填写链接 */
  async notifyShare(
    id: number,
    auth: AuthInfo | undefined,
    body: { userIds?: Array<number | string>; message?: string }
  ) {
    await this.assertSurveyAccess(id, auth, { write: true })
    const share = await this.getShareInfo(id, auth)
    if (!share.shareCode) {
      throw new BadRequestException('请先发布问卷后再分享')
    }
    const userIds = (body.userIds || []).map(Number).filter(n => n > 0)
    if (!userIds.length) {
      throw new BadRequestException('请选择接收用户')
    }
    const sendId = resolveUserId(auth)
    const Notify = (await import('../../../public/provider/notify')).default
    const payload = JSON.stringify({
      title: `问卷邀请：${(await this.detail(id, auth)).title}`,
      content: body.message || `请填写问卷：${share.fillPath}`,
      link: share.fillPath,
      surveyId: id,
      shareCode: share.shareCode
    })
    const created = await Notify.sendNotifyToUsers({
      sendId,
      receiveIds: userIds,
      notifyType: 'survey',
      notifyMsg: payload
    })
    return { sent: created.length, fillPath: share.fillPath }
  }

  /** Expose for other services */
  getPrisma() {
    return this.prisma
  }

  parsePublishBody(body: Record<string, unknown>) {
    return asRecord(body)
  }
}
