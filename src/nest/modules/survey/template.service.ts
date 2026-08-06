import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SurveyService } from "./survey.service";
import { AuthInfo, resolveUserId } from "./survey.util";

const SEED_TEMPLATES = [
  {
    title: "用户满意度调查",
    description: "快速了解用户对产品/服务的满意度",
    category: "satisfaction",
    content: {
      title: "用户满意度调查",
      description: "感谢您抽出时间填写本问卷",
      questions: [
        {
          type: "rating",
          title: "您对我们的整体满意度如何？",
          required: true,
          sortOrder: 0,
          pageIndex: 1,
          config: { max: 5 },
          options: [],
        },
        {
          type: "radio",
          title: "您是否愿意向朋友推荐我们？",
          required: true,
          sortOrder: 1,
          pageIndex: 1,
          config: {},
          options: [
            { content: "非常愿意", sortOrder: 0 },
            { content: "愿意", sortOrder: 1 },
            { content: "一般", sortOrder: 2 },
            { content: "不愿意", sortOrder: 3 },
          ],
        },
        {
          type: "textarea",
          title: "您还有哪些建议？",
          required: false,
          sortOrder: 2,
          pageIndex: 1,
          config: {},
          options: [],
        },
      ],
    },
  },
  {
    title: "活动反馈问卷",
    description: "活动结束后收集参与者反馈",
    category: "feedback",
    content: {
      title: "活动反馈问卷",
      description: "请对本次活动进行评价",
      questions: [
        {
          type: "radio",
          title: "您是如何得知本次活动的？",
          required: true,
          sortOrder: 0,
          pageIndex: 1,
          config: {},
          options: [
            { content: "朋友推荐", sortOrder: 0 },
            { content: "社交媒体", sortOrder: 1 },
            { content: "官网/邮件", sortOrder: 2 },
            { content: "其他", sortOrder: 3, isOther: true },
          ],
        },
        {
          type: "checkbox",
          title: "您最喜欢活动的哪些环节？",
          required: true,
          sortOrder: 1,
          pageIndex: 1,
          config: {},
          options: [
            { content: "主题演讲", sortOrder: 0 },
            { content: "互动环节", sortOrder: 1 },
            { content: "展示展览", sortOrder: 2 },
            { content: "餐饮交流", sortOrder: 3 },
          ],
        },
        {
          type: "rating",
          title: "活动组织评分",
          required: true,
          sortOrder: 2,
          pageIndex: 1,
          config: { max: 5 },
          options: [],
        },
      ],
    },
  },
  {
    title: "需求收集问卷",
    description: "收集功能需求与使用场景",
    category: "requirement",
    content: {
      title: "需求收集问卷",
      description: "帮助我们更好地规划产品",
      questions: [
        {
          type: "checkbox",
          title: "您希望增加哪些功能？",
          required: true,
          sortOrder: 0,
          pageIndex: 1,
          config: {},
          options: [
            { content: "数据导出", sortOrder: 0 },
            { content: "移动端适配", sortOrder: 1 },
            { content: "协作编辑", sortOrder: 2 },
            { content: "AI 辅助", sortOrder: 3 },
          ],
        },
        {
          type: "radio",
          title: "您的使用频率？",
          required: true,
          sortOrder: 1,
          pageIndex: 1,
          config: {},
          options: [
            { content: "每天", sortOrder: 0 },
            { content: "每周", sortOrder: 1 },
            { content: "每月", sortOrder: 2 },
            { content: "偶尔", sortOrder: 3 },
          ],
        },
        {
          type: "textarea",
          title: "请描述您最希望解决的问题",
          required: false,
          sortOrder: 2,
          pageIndex: 1,
          config: {},
          options: [],
        },
      ],
    },
  },
];

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveyService: SurveyService,
  ) {}

  private async ensureSeedTemplates() {
    const count = await this.prisma.client.surveyTemplate.count({
      where: { isPublic: true },
    });
    if (count > 0) return;
    for (const t of SEED_TEMPLATES) {
      await this.prisma.client.surveyTemplate.create({
        data: {
          title: t.title,
          description: t.description,
          category: t.category,
          content: t.content as Prisma.InputJsonValue,
          isPublic: true,
          creatorId: null,
        },
      });
    }
  }

  private mapTemplate(t: {
    id: bigint;
    title: string;
    description: string | null;
    category: string | null;
    coverImage: string | null;
    content: unknown;
    isPublic: boolean;
    creatorId: bigint | null;
    useCount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: Number(t.id),
      title: t.title,
      description: t.description,
      category: t.category,
      coverImage: t.coverImage,
      content: t.content,
      isPublic: t.isPublic,
      creatorId: t.creatorId != null ? Number(t.creatorId) : null,
      useCount: t.useCount,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  async list(
    auth: AuthInfo | undefined,
    query: { category?: string; keyword?: string; mine?: string },
  ) {
    await this.ensureSeedTemplates();
    const userId = resolveUserId(auth);
    const where: Prisma.SurveyTemplateWhereInput = {};
    if (query.mine === "1" || query.mine === "true") {
      where.creatorId = BigInt(userId);
    } else {
      where.OR = [{ isPublic: true }, { creatorId: BigInt(userId) }];
    }
    if (query.category) where.category = query.category;
    if (query.keyword) {
      where.AND = [
        {
          OR: [
            { title: { contains: query.keyword } },
            { description: { contains: query.keyword } },
          ],
        },
      ];
    }

    const rows = await this.prisma.client.surveyTemplate.findMany({
      where,
      orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map((r) => this.mapTemplate(r));
  }

  async create(auth: AuthInfo | undefined, body: Record<string, unknown>) {
    const userId = resolveUserId(auth);
    const title = String(body.title || "").trim();
    if (!title) throw new BadRequestException("模板标题不能为空");
    if (!body.content) throw new BadRequestException("模板内容不能为空");

    const row = await this.prisma.client.surveyTemplate.create({
      data: {
        title,
        description:
          body.description != null ? String(body.description) : null,
        category: body.category != null ? String(body.category) : null,
        coverImage:
          body.coverImage != null ? String(body.coverImage) : null,
        content: body.content as Prisma.InputJsonValue,
        isPublic: body.isPublic !== undefined ? Boolean(body.isPublic) : false,
        creatorId: BigInt(userId),
      },
    });
    return this.mapTemplate(row);
  }

  async update(
    id: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>,
  ) {
    const userId = resolveUserId(auth);
    const row = await this.prisma.client.surveyTemplate.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) throw new NotFoundException("模板不存在");
    const perms = auth?.permissions || [];
    const roles = auth?.roleCodes || [];
    const isAdmin =
      roles.includes("super_admin") ||
      roles.includes("admin") ||
      perms.includes("survey:questionnaire:template");
    if (row.creatorId != null && Number(row.creatorId) !== userId && !isAdmin) {
      throw new BadRequestException("无权编辑该模板");
    }
    const data: Prisma.SurveyTemplateUpdateInput = {};
    if (body.title != null) data.title = String(body.title).trim();
    if (body.description !== undefined) {
      data.description =
        body.description == null ? null : String(body.description);
    }
    if (body.category !== undefined) {
      data.category = body.category == null ? null : String(body.category);
    }
    if (body.coverImage !== undefined) {
      data.coverImage =
        body.coverImage == null ? null : String(body.coverImage);
    }
    if (body.content !== undefined) {
      data.content = body.content as Prisma.InputJsonValue;
    }
    if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic);
    const updated = await this.prisma.client.surveyTemplate.update({
      where: { id: BigInt(id) },
      data,
    });
    return this.mapTemplate(updated);
  }

  async remove(id: number, auth?: AuthInfo) {
    const userId = resolveUserId(auth);
    const row = await this.prisma.client.surveyTemplate.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) throw new NotFoundException("模板不存在");
    if (row.creatorId != null && Number(row.creatorId) !== userId) {
      // allow admin via list permission path — still allow delete of own or public seed by admin
      const perms = auth?.permissions || [];
      const roles = auth?.roleCodes || [];
      const isAdmin =
        roles.includes("super_admin") ||
        roles.includes("admin") ||
        perms.includes("survey:questionnaire:template");
      if (!isAdmin) throw new BadRequestException("无权删除该模板");
    }
    await this.prisma.client.surveyTemplate.delete({
      where: { id: BigInt(id) },
    });
    return true;
  }

  async useTemplate(id: number, auth?: AuthInfo) {
    const userId = resolveUserId(auth);
    const tpl = await this.prisma.client.surveyTemplate.findUnique({
      where: { id: BigInt(id) },
    });
    if (!tpl) throw new NotFoundException("模板不存在");

    const content = (tpl.content || {}) as {
      title?: string;
      description?: string;
      questions?: Array<Record<string, unknown>>;
      scoringEnabled?: boolean;
      scoringConfig?: unknown;
      settings?: unknown;
      themeConfig?: unknown;
    };

    await this.prisma.client.surveyTemplate.update({
      where: { id: tpl.id },
      data: { useCount: { increment: 1 } },
    });

    const created = await this.surveyService.create(auth, {
      title: content.title || tpl.title,
      description: content.description || tpl.description,
      scoringEnabled: Boolean(content.scoringEnabled),
      scoringConfig: content.scoringConfig,
      settings: content.settings,
      themeConfig: content.themeConfig,
      type: "normal",
    });

    if (Array.isArray(content.questions) && content.questions.length) {
      await this.surveyService.saveQuestions(created.id, auth, {
        questions: content.questions,
      });
    }

    return this.surveyService.detail(created.id, auth);
  }

  // ---- Question bank ----

  private mapBankItem(row: {
    id: bigint;
    userId: bigint;
    type: string;
    title: string;
    description: string | null;
    required: boolean;
    config: unknown;
    options: unknown;
    tags: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      type: row.type,
      title: row.title,
      description: row.description,
      required: row.required,
      config: row.config,
      options: row.options,
      tags: row.tags,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listBank(
    auth: AuthInfo | undefined,
    query: { type?: string; keyword?: string; tag?: string },
  ) {
    const userId = resolveUserId(auth);
    const where: Prisma.SurveyQuestionBankItemWhereInput = {
      userId: BigInt(userId),
    };
    if (query.type) where.type = query.type;
    if (query.keyword) where.title = { contains: query.keyword };

    const rows = await this.prisma.client.surveyQuestionBankItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    let list = rows.map((r) => this.mapBankItem(r));
    if (query.tag) {
      const tag = String(query.tag);
      list = list.filter((item) => {
        const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
        return tags.includes(tag);
      });
    }
    return list;
  }

  async createBankItem(
    auth: AuthInfo | undefined,
    body: Record<string, unknown>,
  ) {
    const userId = resolveUserId(auth);
    const title = String(body.title || "").trim();
    if (!title) throw new BadRequestException("题目标题不能为空");
    const row = await this.prisma.client.surveyQuestionBankItem.create({
      data: {
        userId: BigInt(userId),
        type: String(body.type || "radio"),
        title,
        description:
          body.description != null ? String(body.description) : null,
        required: Boolean(body.required),
        config: (body.config as Prisma.InputJsonValue) ?? undefined,
        options: (body.options as Prisma.InputJsonValue) ?? undefined,
        tags: (body.tags as Prisma.InputJsonValue) ?? undefined,
      },
    });
    return this.mapBankItem(row);
  }

  async updateBankItem(
    id: number,
    auth: AuthInfo | undefined,
    body: Record<string, unknown>,
  ) {
    const userId = resolveUserId(auth);
    const existing = await this.prisma.client.surveyQuestionBankItem.findFirst(
      {
        where: { id: BigInt(id), userId: BigInt(userId) },
      },
    );
    if (!existing) throw new NotFoundException("题库题目不存在");

    const row = await this.prisma.client.surveyQuestionBankItem.update({
      where: { id: existing.id },
      data: {
        ...(body.type != null ? { type: String(body.type) } : {}),
        ...(body.title != null ? { title: String(body.title) } : {}),
        ...(body.description !== undefined
          ? {
              description:
                body.description == null ? null : String(body.description),
            }
          : {}),
        ...(body.required !== undefined
          ? { required: Boolean(body.required) }
          : {}),
        ...(body.config !== undefined
          ? { config: body.config as Prisma.InputJsonValue }
          : {}),
        ...(body.options !== undefined
          ? { options: body.options as Prisma.InputJsonValue }
          : {}),
        ...(body.tags !== undefined
          ? { tags: body.tags as Prisma.InputJsonValue }
          : {}),
      },
    });
    return this.mapBankItem(row);
  }

  async deleteBankItem(id: number, auth?: AuthInfo) {
    const userId = resolveUserId(auth);
    await this.prisma.client.surveyQuestionBankItem.deleteMany({
      where: { id: BigInt(id), userId: BigInt(userId) },
    });
    return true;
  }
}
