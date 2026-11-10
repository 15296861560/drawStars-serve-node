import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import userService from '../../../public/service/userService'
import {
  ASSESSMENT_TYPE_REGISTRY,
  CHANNEL_SOURCES,
  OA_GUIDE_DEFAULTS,
  type ChannelSource
} from './assessment.constants'
import { AssessmentPointsService } from './assessment-points.service'

interface PageQuery {
  page?: number | string
  pageSize?: number | string
}

interface InfoQuery extends PageQuery {
  status?: number | string
  keyword?: string
}

interface ChannelQuery {
  keyword?: string
  source?: string
}

interface ReplyQuery {
  keyword?: string
  ruleType?: string
}

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly points: AssessmentPointsService
  ) {}

  private toNumber(value: unknown): number {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  // ============================================================
  // 公众号配置（单行表）
  // ============================================================

  private mapOaConfig(row: any) {
    const d = OA_GUIDE_DEFAULTS
    return {
      id: row ? Number(row.id) : 1,
      officialName: row?.officialName || d.officialName,
      wechatId: row?.wechatId || '',
      accountType: (row?.accountType ?? 0) as 0 | 1 | 2,
      qrCodeUrl: row?.qrCodeUrl || '',
      guideEnabled: row ? row.guideEnabled === 1 : true,
      // 兼容前端通用话术字段
      guideTitle: row?.resultGuideTitle || d.result.title,
      guideDesc: row?.resultGuideDesc || d.result.desc,
      resultGuideTitle: row?.resultGuideTitle || d.result.title,
      resultGuideDesc: row?.resultGuideDesc || d.result.desc,
      completeGuideTitle: row?.completeGuideTitle || d.complete.title,
      completeGuideDesc: row?.completeGuideDesc || d.complete.desc,
      posterShareText: row?.posterShareText || d.posterShareText,
      plazaPath: row?.plazaPath || d.plazaPath,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : undefined
    }
  }

  async getOaConfig() {
    const row = await this.prisma.client.assessmentOaConfig.findUnique({
      where: { id: BigInt(1) }
    })
    return this.mapOaConfig(row)
  }

  /** C 端引导位配置（字段与 GuideConfig 对齐） */
  async getGuideConfig() {
    const row = await this.prisma.client.assessmentOaConfig.findUnique({
      where: { id: BigInt(1) }
    })
    const d = OA_GUIDE_DEFAULTS
    return {
      officialName: row?.officialName || d.officialName,
      accountType: (row?.accountType ?? 0) as 0 | 1 | 2,
      qrCodeUrl: row?.qrCodeUrl || '',
      guideEnabled: row ? row.guideEnabled === 1 : true,
      result: {
        title: row?.resultGuideTitle || d.result.title,
        desc: row?.resultGuideDesc || d.result.desc
      },
      complete: {
        title: row?.completeGuideTitle || d.complete.title,
        desc: row?.completeGuideDesc || d.complete.desc
      },
      posterShareText: row?.posterShareText || d.posterShareText,
      plazaPath: row?.plazaPath || d.plazaPath
    }
  }

  async updateOaConfig(data: Record<string, any>, userId?: number) {
    const current = await this.getOaConfig()
    const guideTitle = data.guideTitle ?? data.resultGuideTitle
    const guideDesc = data.guideDesc ?? data.resultGuideDesc
    const payload = {
      officialName:
        data.officialName !== undefined
          ? String(data.officialName)
          : current.officialName,
      wechatId:
        data.wechatId !== undefined ? String(data.wechatId) : current.wechatId,
      accountType:
        data.accountType !== undefined
          ? Number(data.accountType)
          : current.accountType,
      qrCodeUrl:
        data.qrCodeUrl !== undefined ? String(data.qrCodeUrl) : current.qrCodeUrl,
      guideEnabled:
        data.guideEnabled !== undefined
          ? data.guideEnabled
            ? 1
            : 0
          : current.guideEnabled
            ? 1
            : 0,
      resultGuideTitle:
        data.resultGuideTitle !== undefined
          ? String(data.resultGuideTitle)
          : guideTitle !== undefined
            ? String(guideTitle)
            : current.resultGuideTitle,
      resultGuideDesc:
        data.resultGuideDesc !== undefined
          ? String(data.resultGuideDesc)
          : guideDesc !== undefined
            ? String(guideDesc)
            : current.resultGuideDesc,
      completeGuideTitle:
        data.completeGuideTitle !== undefined
          ? String(data.completeGuideTitle)
          : current.completeGuideTitle,
      completeGuideDesc:
        data.completeGuideDesc !== undefined
          ? String(data.completeGuideDesc)
          : current.completeGuideDesc,
      posterShareText:
        data.posterShareText !== undefined
          ? String(data.posterShareText)
          : current.posterShareText,
      plazaPath:
        data.plazaPath !== undefined ? String(data.plazaPath) : current.plazaPath,
      updatedBy: userId ? BigInt(userId) : null
    }

    const row = await this.prisma.client.assessmentOaConfig.upsert({
      where: { id: BigInt(1) },
      create: { id: BigInt(1), ...payload },
      update: payload
    })
    return this.mapOaConfig(row)
  }

  // ============================================================
  // 问卷分享码解析
  // ============================================================

  private async resolveSurveys(surveyIds: number[]) {
    if (!surveyIds.length) {
      return new Map<
        string,
        { shareCode: string; questionCount: number; published: boolean }
      >()
    }
    const surveys = await this.prisma.client.survey.findMany({
      where: { id: { in: surveyIds.map(id => BigInt(id)) }, deletedAt: null },
      include: {
        publishConfig: true,
        _count: { select: { questions: true } }
      }
    })
    return new Map(
      surveys.map(s => [
        String(s.id),
        {
          shareCode: s.publishConfig?.shareCode || '',
          questionCount: s._count.questions,
          published: s.status === 'published'
        }
      ])
    )
  }

  private mapInfo(
    info: any,
    survey?: { shareCode: string; questionCount: number; published: boolean }
  ) {
    return {
      id: Number(info.id),
      title: info.title,
      typeKey: info.typeKey,
      surveyId: Number(info.surveyId),
      shareCode: survey?.shareCode || '',
      coverUrl: info.coverUrl || '',
      subtitle: info.subtitle || '',
      tags: info.tags || '',
      questionNum:
        info.questionNum > 0
          ? info.questionNum
          : survey?.questionCount || 0,
      durationDesc: info.durationDesc || '',
      sort: info.sort,
      status: info.status,
      publishedAt: info.publishedAt ? info.publishedAt.toISOString() : ''
    }
  }

  // ============================================================
  // C 端：问星广场
  // ============================================================

  async plazaList(query: {
    typeKey?: string
    page?: number | string
    pageSize?: number | string
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1)
    const pageSize = Math.min(100, this.toNumber(query.pageSize) || 20)
    const tab = query.typeKey || 'all'

    const where: any = { status: 1 }
    if (tab !== 'all' && tab !== 'hot' && tab !== 'new') {
      where.typeKey = tab
    }

    let rows = await this.prisma.client.assessmentInfo.findMany({
      where,
      orderBy: [{ sort: 'desc' }, { id: 'desc' }]
    })

    if (tab === 'new') {
      rows = rows.sort((a, b) => {
        const av = a.publishedAt ? a.publishedAt.getTime() : 0
        const bv = b.publishedAt ? b.publishedAt.getTime() : 0
        return bv - av
      })
    } else if (tab === 'hot') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const grouped = await this.prisma.client.assessmentEvent.groupBy({
        by: ['refId'],
        where: {
          eventType: 'plaza_click',
          refId: { not: null },
          createdAt: { gte: since }
        },
        _count: { _all: true }
      })
      const clickMap = new Map<string, number>()
      for (const row of grouped) {
        if (row.refId) clickMap.set(String(row.refId), row._count._all)
      }
      rows = rows.sort((a, b) => {
        const diff =
          (clickMap.get(String(b.id)) || 0) - (clickMap.get(String(a.id)) || 0)
        return diff !== 0 ? diff : b.sort - a.sort
      })
    }

    const total = rows.length
    const paged = rows.slice((page - 1) * pageSize, page * pageSize)
    const surveyMap = await this.resolveSurveys(
      paged.map(row => Number(row.surveyId))
    )
    const list = paged
      .map(row => this.mapInfo(row, surveyMap.get(String(row.surveyId))))
      .filter(item => item.shareCode)
    return { list, total }
  }

  // ============================================================
  // 管理端：测评上架
  // ============================================================

  async listInfos(query: InfoQuery) {
    const page = Math.max(1, this.toNumber(query.page) || 1)
    const pageSize = Math.min(100, this.toNumber(query.pageSize) || 20)
    const where: any = {}
    if (query.status !== undefined && query.status !== '') {
      where.status = Number(query.status)
    }
    if (query.keyword) {
      where.title = { contains: String(query.keyword) }
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.assessmentInfo.count({ where }),
      this.prisma.client.assessmentInfo.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])
    const surveyMap = await this.resolveSurveys(
      rows.map(row => Number(row.surveyId))
    )
    return {
      list: rows.map(row =>
        this.mapInfo(row, surveyMap.get(String(row.surveyId)))
      ),
      total
    }
  }

  private assertTypeKey(typeKey: string) {
    if (!ASSESSMENT_TYPE_REGISTRY[typeKey]) {
      throw new BadRequestException('类型库不存在')
    }
  }

  async createInfo(data: Record<string, any>, userId?: number) {
    const typeKey = String(data.typeKey || '')
    this.assertTypeKey(typeKey)
    const title = String(data.title || '').trim()
    if (!title) throw new BadRequestException('测评标题不能为空')

    const surveyId = this.toNumber(data.surveyId)
    if (!surveyId) throw new BadRequestException('请选择关联问卷')
    const survey = await this.prisma.client.survey.findUnique({
      where: { id: BigInt(surveyId) },
      include: { _count: { select: { questions: true } } }
    })
    if (!survey || survey.deletedAt) {
      throw new BadRequestException('关联问卷不存在')
    }

    const typeDef = ASSESSMENT_TYPE_REGISTRY[typeKey]
    const row = await this.prisma.client.assessmentInfo.create({
      data: {
        title,
        typeKey,
        surveyId: BigInt(surveyId),
        coverUrl: data.coverUrl ? String(data.coverUrl) : null,
        subtitle: data.subtitle ? String(data.subtitle) : null,
        tags: data.tags ? String(data.tags) : null,
        questionNum:
          this.toNumber(data.questionNum) || survey._count.questions,
        durationDesc: data.durationDesc
          ? String(data.durationDesc)
          : typeDef.durationDesc,
        sort: Number(data.sort ?? 0) || 0,
        status: 0,
        creatorId: userId ? BigInt(userId) : null
      }
    })
    return this.mapInfo(row, {
      shareCode: '',
      questionCount: survey._count.questions,
      published: survey.status === 'published'
    })
  }

  async updateInfo(id: number, data: Record<string, any>) {
    const current = await this.prisma.client.assessmentInfo.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('测评记录不存在')

    const update: any = {}
    if (data.title !== undefined) {
      const title = String(data.title).trim()
      if (!title) throw new BadRequestException('测评标题不能为空')
      update.title = title
    }
    if (data.typeKey !== undefined) {
      this.assertTypeKey(String(data.typeKey))
      update.typeKey = String(data.typeKey)
    }
    if (data.surveyId !== undefined) {
      const surveyId = this.toNumber(data.surveyId)
      const survey = surveyId
        ? await this.prisma.client.survey.findUnique({
            where: { id: BigInt(surveyId) },
            include: { _count: { select: { questions: true } } }
          })
        : null
      if (!survey || survey.deletedAt) {
        throw new BadRequestException('关联问卷不存在')
      }
      update.surveyId = BigInt(surveyId)
      if (data.questionNum === undefined) {
        update.questionNum = survey._count.questions
      }
    }
    for (const key of [
      'coverUrl',
      'subtitle',
      'tags',
      'durationDesc'
    ] as const) {
      if (data[key] !== undefined) update[key] = String(data[key])
    }
    if (data.questionNum !== undefined) {
      update.questionNum = this.toNumber(data.questionNum)
    }
    if (data.sort !== undefined) {
      update.sort = Number(data.sort) || 0
    }

    // 4.1.4 状态机：编辑已上架记录 → 强制下架（未显式声明状态时）
    if (current.status === 1 && data.status === undefined) {
      update.status = 2
    } else if (data.status !== undefined) {
      update.status = Number(data.status)
    }

    const row = await this.prisma.client.assessmentInfo.update({
      where: { id: BigInt(id) },
      data: update
    })
    const surveyMap = await this.resolveSurveys([Number(row.surveyId)])
    return this.mapInfo(row, surveyMap.get(String(row.surveyId)))
  }

  async deleteInfo(id: number) {
    const current = await this.prisma.client.assessmentInfo.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('测评记录不存在')
    await this.prisma.client.assessmentInfo.delete({
      where: { id: BigInt(id) }
    })
    return { id }
  }

  /** 上架/下架（4.1.4 四项校验） */
  async publishInfo(id: number, publish: boolean) {
    const current = await this.prisma.client.assessmentInfo.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('测评记录不存在')

    if (!publish) {
      const row = await this.prisma.client.assessmentInfo.update({
        where: { id: BigInt(id) },
        data: { status: 2 }
      })
      const surveyMap = await this.resolveSurveys([Number(row.surveyId)])
      return this.mapInfo(row, surveyMap.get(String(row.surveyId)))
    }

    this.assertTypeKey(current.typeKey)
    if (!String(current.title || '').trim()) {
      throw new BadRequestException('测评标题不能为空')
    }
    const survey = await this.prisma.client.survey.findUnique({
      where: { id: current.surveyId },
      include: {
        publishConfig: true,
        _count: { select: { questions: true } }
      }
    })
    if (!survey || survey.deletedAt || survey.status !== 'published') {
      throw new BadRequestException('关联问卷尚未发布')
    }
    if (!survey.publishConfig?.shareCode) {
      throw new BadRequestException('关联问卷缺少公开分享码')
    }
    if (survey._count.questions <= 0) {
      throw new BadRequestException('关联问卷没有题目，无法上架')
    }

    const row = await this.prisma.client.assessmentInfo.update({
      where: { id: BigInt(id) },
      data: {
        status: 1,
        questionNum: survey._count.questions,
        publishedAt: current.publishedAt || new Date()
      }
    })
    return this.mapInfo(row, {
      shareCode: survey.publishConfig.shareCode,
      questionCount: survey._count.questions,
      published: true
    })
  }

  // ============================================================
  // 管理端：渠道入口
  // ============================================================

  private assertChannelSource(source: string) {
    if (!CHANNEL_SOURCES.includes(source as ChannelSource)) {
      throw new BadRequestException('非法的渠道来源')
    }
  }

  private mapChannel(row: any) {
    return {
      id: Number(row.id),
      name: row.name,
      source: row.source,
      refId: row.refId,
      targetType: row.targetType,
      surveyId: row.surveyId ? Number(row.surveyId) : undefined,
      shareCode: row.shareCode || '',
      infoId: row.infoId ? Number(row.infoId) : undefined,
      status: row.status,
      startAt: row.startAt ? row.startAt.toISOString() : '',
      endAt: row.endAt ? row.endAt.toISOString() : '',
      remark: row.remark || '',
      createdAt: row.createdAt ? row.createdAt.toISOString() : ''
    }
  }

  async listChannels(query: ChannelQuery) {
    const where: any = {}
    if (query.source) where.source = String(query.source)
    if (query.keyword) where.name = { contains: String(query.keyword) }
    const rows = await this.prisma.client.assessmentChannel.findMany({
      where,
      orderBy: { id: 'desc' }
    })
    return { list: rows.map(row => this.mapChannel(row)), total: rows.length }
  }

  private async resolveShareCode(surveyId: number, shareCode?: string) {
    if (shareCode) return String(shareCode)
    const publish = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { surveyId: BigInt(surveyId) }
    })
    if (!publish?.shareCode) {
      throw new BadRequestException('关联问卷缺少公开分享码')
    }
    return publish.shareCode
  }

  async createChannel(data: Record<string, any>, userId?: number) {
    const source = String(data.source || '')
    this.assertChannelSource(source)
    const name = String(data.name || '').trim()
    if (!name) throw new BadRequestException('入口名称不能为空')
    const refId = String(data.refId || '').trim()
    if (!refId) throw new BadRequestException('渠道暗标识不能为空')
    if (refId.length > 32) throw new BadRequestException('渠道暗标识过长')

    const targetType = data.targetType === 'plaza' ? 'plaza' : 'fill'
    let surveyId: number | null = null
    let shareCode: string | null = null
    if (targetType === 'fill') {
      surveyId = this.toNumber(data.surveyId)
      if (!surveyId) throw new BadRequestException('请选择落地问卷')
      shareCode = await this.resolveShareCode(surveyId, data.shareCode)
    }

    try {
      const row = await this.prisma.client.assessmentChannel.create({
        data: {
          name,
          source,
          refId,
          targetType,
          surveyId: surveyId ? BigInt(surveyId) : null,
          shareCode,
          infoId: this.toNumber(data.infoId)
            ? BigInt(this.toNumber(data.infoId))
            : null,
          status: data.status !== undefined ? Number(data.status) : 1,
          startAt: data.startAt ? new Date(data.startAt) : null,
          endAt: data.endAt ? new Date(data.endAt) : null,
          remark: data.remark ? String(data.remark) : null,
          creatorId: userId ? BigInt(userId) : null
        }
      })
      return this.mapChannel(row)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('该来源下的渠道暗标识已存在')
      }
      throw error
    }
  }

  async updateChannel(id: number, data: Record<string, any>) {
    const current = await this.prisma.client.assessmentChannel.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('渠道记录不存在')

    const update: any = {}
    if (data.name !== undefined) {
      const name = String(data.name).trim()
      if (!name) throw new BadRequestException('入口名称不能为空')
      update.name = name
    }
    if (data.source !== undefined) {
      const source = String(data.source)
      this.assertChannelSource(source)
      update.source = source
    }
    if (data.refId !== undefined) {
      const refId = String(data.refId).trim()
      if (!refId) throw new BadRequestException('渠道暗标识不能为空')
      if (refId.length > 32) throw new BadRequestException('渠道暗标识过长')
      update.refId = refId
    }
    if (data.targetType !== undefined) {
      update.targetType = data.targetType === 'plaza' ? 'plaza' : 'fill'
    }
    const targetType = update.targetType || current.targetType
    if (targetType === 'fill') {
      const surveyId = this.toNumber(data.surveyId ?? current.surveyId)
      if (!surveyId) throw new BadRequestException('请选择落地问卷')
      update.surveyId = BigInt(surveyId)
      if (data.shareCode !== undefined) {
        update.shareCode = String(data.shareCode)
      } else if (data.surveyId !== undefined) {
        update.shareCode = await this.resolveShareCode(surveyId)
      }
    } else {
      update.surveyId = null
      update.shareCode = null
    }
    if (data.infoId !== undefined) {
      update.infoId = this.toNumber(data.infoId)
        ? BigInt(this.toNumber(data.infoId))
        : null
    }
    if (data.status !== undefined) update.status = Number(data.status)
    if (data.startAt !== undefined) {
      update.startAt = data.startAt ? new Date(data.startAt) : null
    }
    if (data.endAt !== undefined) {
      update.endAt = data.endAt ? new Date(data.endAt) : null
    }
    if (data.remark !== undefined) update.remark = String(data.remark)

    try {
      const row = await this.prisma.client.assessmentChannel.update({
        where: { id: BigInt(id) },
        data: update
      })
      return this.mapChannel(row)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('该来源下的渠道暗标识已存在')
      }
      throw error
    }
  }

  async deleteChannel(id: number) {
    const current = await this.prisma.client.assessmentChannel.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('渠道记录不存在')
    await this.prisma.client.assessmentChannel.delete({
      where: { id: BigInt(id) }
    })
    return { id }
  }

  // ============================================================
  // 管理端：回复规则
  // ============================================================

  private mapReplyRule(row: any) {
    return {
      id: Number(row.id),
      ruleType: row.ruleType,
      keywords: row.keywords || '',
      replyContent: row.replyContent || '',
      source: row.channelSource || '',
      refId: row.refId || '',
      linkUrl: row.linkUrl || '',
      status: row.status,
      syncStatus: row.syncStatus,
      sort: row.sort,
      remark: row.remark || '',
      createdAt: row.createdAt ? row.createdAt.toISOString() : '',
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : ''
    }
  }

  async listReplyRules(query: ReplyQuery) {
    const where: any = {}
    if (query.ruleType) where.ruleType = String(query.ruleType)
    if (query.keyword) {
      where.OR = [
        { keywords: { contains: String(query.keyword) } },
        { replyContent: { contains: String(query.keyword) } }
      ]
    }
    const rows = await this.prisma.client.assessmentReplyRule.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'desc' }]
    })
    return { list: rows.map(row => this.mapReplyRule(row)), total: rows.length }
  }

  private assertReplyRule(ruleType: string, keywords?: string | null) {
    if (ruleType !== 'keyword' && ruleType !== 'welcome') {
      throw new BadRequestException('非法的规则类型')
    }
    if (ruleType === 'keyword' && !String(keywords || '').trim()) {
      throw new BadRequestException('关键词规则必须配置触发词')
    }
  }

  async createReplyRule(data: Record<string, any>, userId?: number) {
    const ruleType = String(data.ruleType || '')
    this.assertReplyRule(ruleType, data.keywords)
    const replyContent = String(data.replyContent || '').trim()
    if (!replyContent) throw new BadRequestException('回复内容不能为空')

    const row = await this.prisma.client.assessmentReplyRule.create({
      data: {
        ruleType,
        keywords: ruleType === 'keyword' ? String(data.keywords) : null,
        replyContent,
        channelSource: data.source ? String(data.source) : null,
        refId: data.refId ? String(data.refId) : null,
        linkUrl: data.linkUrl ? String(data.linkUrl) : null,
        status: data.status !== undefined ? Number(data.status) : 1,
        syncStatus: data.syncStatus === 'synced' ? 'synced' : 'pending',
        sort: Number(data.sort ?? 0) || 0,
        remark: data.remark ? String(data.remark) : null,
        creatorId: userId ? BigInt(userId) : null
      }
    })
    return this.mapReplyRule(row)
  }

  async updateReplyRule(id: number, data: Record<string, any>) {
    const current = await this.prisma.client.assessmentReplyRule.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('回复规则不存在')

    const ruleType =
      data.ruleType !== undefined ? String(data.ruleType) : current.ruleType
    const keywords =
      data.keywords !== undefined ? String(data.keywords) : current.keywords
    this.assertReplyRule(ruleType, keywords)

    const update: any = { ruleType }
    if (data.keywords !== undefined || ruleType === 'welcome') {
      update.keywords = ruleType === 'keyword' ? keywords : null
    }
    if (data.replyContent !== undefined) {
      const content = String(data.replyContent).trim()
      if (!content) throw new BadRequestException('回复内容不能为空')
      update.replyContent = content
    }
    if (data.source !== undefined) {
      update.channelSource = data.source ? String(data.source) : null
    }
    if (data.refId !== undefined) {
      update.refId = data.refId ? String(data.refId) : null
    }
    if (data.linkUrl !== undefined) {
      update.linkUrl = data.linkUrl ? String(data.linkUrl) : null
    }
    if (data.status !== undefined) update.status = Number(data.status)
    if (data.syncStatus !== undefined) {
      update.syncStatus = data.syncStatus === 'synced' ? 'synced' : 'pending'
    }
    if (data.sort !== undefined) update.sort = Number(data.sort) || 0
    if (data.remark !== undefined) {
      update.remark = data.remark ? String(data.remark) : null
    }

    const row = await this.prisma.client.assessmentReplyRule.update({
      where: { id: BigInt(id) },
      data: update
    })
    return this.mapReplyRule(row)
  }

  async deleteReplyRule(id: number) {
    const current = await this.prisma.client.assessmentReplyRule.findUnique({
      where: { id: BigInt(id) }
    })
    if (!current) throw new BadRequestException('回复规则不存在')
    await this.prisma.client.assessmentReplyRule.delete({
      where: { id: BigInt(id) }
    })
    return { id }
  }

  // ============================================================
  // 管理端：数据看板
  // ============================================================

  async statsOverview(daysQuery?: number | string) {
    const days = Math.min(180, Math.max(1, this.toNumber(daysQuery) || 30))
    const now = new Date()
    const today = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    )
    const since = new Date(today)
    since.setUTCDate(since.getUTCDate() - (days - 1))

    const [events, txs, infos] = await Promise.all([
      this.prisma.client.assessmentEvent.findMany({
        where: { createdDay: { gte: since } },
        select: {
          eventType: true,
          sessionId: true,
          source: true,
          refId: true,
          surveyId: true,
          userId: true,
          isNewUser: true,
          createdDay: true
        }
      }),
      this.prisma.client.pointsTransaction.findMany({
        where: { source: 'assessment', createdAt: { gte: since } },
        select: { referenceType: true, referenceId: true, points: true }
      }),
      this.prisma.client.assessmentInfo.findMany({
        select: { id: true, title: true, typeKey: true, surveyId: true }
      })
    ])

    const count = (type: string) =>
      events.filter(e => e.eventType === type).length
    const rate = (a: number, b: number) =>
      b > 0 ? Math.round((a / b) * 100) / 100 : 0

    // L1 去重：session + source + refId
    const seen = new Set<string>()
    let l1 = 0
    for (const e of events) {
      if (e.eventType !== 'channel_visit') continue
      const key = `${e.sessionId}|${e.source}|${e.refId}`
      if (seen.has(key)) continue
      seen.add(key)
      l1 += 1
    }

    const e02 = count('plaza_click')
    const e03 = count('response_complete')
    const e04 = count('register_show')
    const e05new = events.filter(
      e => e.eventType === 'register_success' && e.isNewUser === 1
    ).length
    const completeGrants = txs.filter(
      t => t.referenceType === 'survey_response'
    ).length
    const shareTotal = count('share_click') + count('poster_create')

    const funnel = [
      { key: 'channel_visit', label: '渠道进入', value: l1 },
      {
        key: 'plaza_click',
        label: '广场点击',
        value: e02,
        rate: rate(e02, l1)
      },
      {
        key: 'response_complete',
        label: '测评完成',
        value: e03,
        rate: rate(e03, e02)
      },
      {
        key: 'register_show',
        label: '注册曝光',
        value: e04,
        rate: rate(e04, e03)
      },
      {
        key: 'register_success',
        label: '注册成功',
        value: e05new,
        rate: rate(e05new, e04)
      },
      {
        key: 'points_grant',
        label: '积分发放',
        value: completeGrants,
        rate: rate(completeGrants, e05new)
      },
      {
        key: 'share',
        label: '分享行为',
        value: shareTotal,
        rate: rate(shareTotal, completeGrants)
      }
    ]

    const pivot = CHANNEL_SOURCES.map(source => {
      const srcEvents = events.filter(e => e.source === source)
      const visits = srcEvents.filter(e => e.eventType === 'channel_visit').length
      const completes = srcEvents.filter(
        e => e.eventType === 'response_complete'
      ).length
      const registers = srcEvents.filter(
        e => e.eventType === 'register_success'
      ).length
      const posters = srcEvents.filter(e => e.eventType === 'poster_create').length
      return {
        source,
        visits,
        completes,
        registers,
        posters,
        completeRate: rate(completes, visits)
      }
    })

    const dayKey = (d: Date) => {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const trend: Array<{
      date: string
      e01: number
      e03: number
      e05: number
    }> = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const key = dayKey(d)
      const dayEvents = events.filter(e => dayKey(e.createdDay) === key)
      trend.push({
        date: key,
        e01: dayEvents.filter(e => e.eventType === 'channel_visit').length,
        e03: dayEvents.filter(e => e.eventType === 'response_complete').length,
        e05: dayEvents.filter(e => e.eventType === 'register_success').length
      })
    }

    const compBySurvey = new Map<string, number>()
    for (const e of events) {
      if (e.eventType === 'response_complete' && e.surveyId != null) {
        const key = String(e.surveyId)
        compBySurvey.set(key, (compBySurvey.get(key) || 0) + 1)
      }
    }
    const clicksByInfo = new Map<string, number>()
    for (const e of events) {
      if (e.eventType === 'plaza_click') {
        const key = String(e.refId || '')
        clicksByInfo.set(key, (clicksByInfo.get(key) || 0) + 1)
      }
    }
    const topSurveys = infos
      .map(info => {
        const completes = compBySurvey.get(String(info.surveyId)) || 0
        const visits =
          (clicksByInfo.get(String(info.id)) || 0) + completes
        return {
          infoId: Number(info.id),
          title: info.title,
          typeKey: info.typeKey,
          visits,
          completes,
          completeRate: rate(completes, visits)
        }
      })
      .sort((a, b) => b.completes - a.completes)
      .slice(0, 10)

    const welcomeCount = txs.filter(t => t.referenceType === 'user').length
    const posterCount = txs.filter(
      t => t.referenceType === 'assessment_event'
    ).length
    const totalPoints = txs.reduce((sum, t) => sum + t.points, 0)
    const guestCompletes = events.filter(
      e => e.eventType === 'response_complete' && e.userId == null
    ).length

    // 补领成功笔数：已完成积分且答卷已绑定用户
    let claimCount = 0
    const completeRefIds = txs
      .filter(t => t.referenceType === 'survey_response' && t.referenceId)
      .map(t => Number(t.referenceId))
      .filter(n => Number.isFinite(n) && n > 0)
    if (completeRefIds.length) {
      claimCount = await this.prisma.client.surveyResponse.count({
        where: {
          id: { in: completeRefIds.map(n => BigInt(n)) },
          userId: { not: null }
        }
      })
    }

    return {
      days,
      funnel,
      channelPivot: pivot,
      trend,
      register: {
        showCount: e04,
        successCount: count('register_success'),
        newCount: e05new,
        rate: rate(e05new, e04)
      },
      points: {
        completeCount: completeGrants,
        posterCount,
        welcomeCount,
        totalPoints,
        grantRate: rate(completeGrants, e03),
        claimable: guestCompletes,
        claimCount
      },
      topSurveys
    }
  }

  // ============================================================
  // 游客快捷注册（5.6.2）
  // ============================================================

  async quickRegister(body: Record<string, any>) {
    const phone = String(body.phone || '').trim()
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确')
    }
    const captcha = String(body.captcha || '').trim()
    if (!captcha) throw new BadRequestException('请输入验证码')

    // 沿用短信验证码体系：兼容 login / register 两种发送类型
    let verified = false
    for (const type of ['login', 'register']) {
      try {
        if (await this.usersService.verifyCaptcha(phone, captcha, type)) {
          verified = true
          break
        }
      } catch {
        /* 尝试验证码类型 */
      }
    }
    if (!verified) throw new BadRequestException('验证码错误或已过期')

    const existing = await userService.queryUserByPhone(phone)
    let userId: number
    let isNewUser = false
    let userRecord: Record<string, any>

    if (existing) {
      const record = existing as Record<string, any>
      if (record.deletedAt) throw new BadRequestException('账号已注销')
      if (record.status && record.status !== 'active') {
        throw new BadRequestException('账号已停用')
      }
      userId = Number(record.id)
      userRecord = record
    } else {
      const nowDate = Date.now()
      const nickname = String(body.nickname || '').trim()
      const payload: Record<string, unknown> = {
        name: nickname || `星友${phone.slice(-4)}`,
        phone,
        createTime: nowDate,
        updateTime: nowDate,
        level: 1,
        status: 'active',
        smsLoginEnabled: true,
        oauthLoginEnabled: true
      }
      userId = await userService.registerByPhone(payload)
      if (!userId) throw new BadRequestException('注册失败')
      isNewUser = true
      userRecord =
        ((await userService.queryUserByPhone(phone)) as Record<string, any>) ||
        { id: userId, name: payload.name, phone }
    }

    userService.setToken(userRecord as never)

    const pointsDetail: number[] = []
    let grantedPoints = 0

    // 新人礼（幂等键 user/userId）
    if (isNewUser) {
      const welcome = await this.points.grant('REGISTER_WELCOME', {}, userId)
      if (welcome.granted) {
        grantedPoints += welcome.points
        pointsDetail.push(welcome.points)
      }
    }

    // 游客答卷迁移 + 完成积分补领
    const rawIds: unknown[] = Array.isArray(body.responseIds)
      ? [...body.responseIds]
      : []
    if (body.responseId !== undefined) rawIds.push(body.responseId)
    const responseIds = Array.from(
      new Set(
        rawIds
          .map(v => Number(v))
          .filter(n => Number.isFinite(n) && n > 0)
      )
    )

    for (const responseId of responseIds) {
      const response = await this.prisma.client.surveyResponse.findUnique({
        where: { id: BigInt(responseId) },
        select: { userId: true }
      })
      if (!response) continue
      if (response.userId != null && Number(response.userId) !== userId) {
        continue
      }
      if (response.userId == null) {
        await this.prisma.client.surveyResponse.update({
          where: { id: BigInt(responseId) },
          data: { userId: BigInt(userId) }
        })
      }
      try {
        const result = await this.points.grant(
          'ASSESSMENT_COMPLETE',
          { responseId },
          userId
        )
        if (result.granted) {
          grantedPoints += result.points
          pointsDetail.push(result.points)
        }
      } catch {
        // 单份答卷积分失败（如日限额）不阻断注册主流程
      }
    }

    return {
      token: String(userRecord.token || ''),
      isNewUser,
      grantedPoints,
      pointsDetail,
      user: {
        id: userId,
        name: userRecord.name || '',
        phone: userRecord.phone || phone
      }
    }
  }
}
