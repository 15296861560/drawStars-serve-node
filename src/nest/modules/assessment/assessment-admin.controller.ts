import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { AssessmentService } from './assessment.service'

type AuthInfo = { uid?: string | number }

/** 管理端接口（公众号配置 / 上架 / 渠道 / 回复规则 / 看板） */
@Controller('assessmentApi')
@UseGuards(PermissionsGuard)
export class AssessmentAdminController {
  constructor(private readonly assessmentService: AssessmentService) {}

  private uid(auth?: AuthInfo): number | undefined {
    const n = auth?.uid ? Number(auth.uid) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  // ---------- 公众号配置 ----------

  @Get('oa/config')
  @RequirePermissions('assessment:oa:list')
  async getOaConfig() {
    const data = await this.assessmentService.getOaConfig()
    return { status: true, msg: 'ok', data }
  }

  @Put('oa/config')
  @RequirePermissions('assessment:oa:manage')
  async updateOaConfig(
    @Body() body: Record<string, unknown>,
    @CurrentUser() auth?: AuthInfo
  ) {
    const data = await this.assessmentService.updateOaConfig(
      body as never,
      this.uid(auth)
    )
    return { status: true, msg: '保存成功', data }
  }

  // ---------- 测评上架 ----------

  @Get('info/list')
  @RequirePermissions('assessment:info:list')
  async listInfos(@Query() query: Record<string, string>) {
    const data = await this.assessmentService.listInfos({
      status: query.status,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize
    })
    return { status: true, msg: 'ok', data }
  }

  @Post('info')
  @RequirePermissions('assessment:info:manage')
  async createInfo(
    @Body() body: Record<string, unknown>,
    @CurrentUser() auth?: AuthInfo
  ) {
    const data = await this.assessmentService.createInfo(
      body as never,
      this.uid(auth)
    )
    return { status: true, msg: '创建成功', data }
  }

  @Put('info/:id')
  @RequirePermissions('assessment:info:manage')
  async updateInfo(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.assessmentService.updateInfo(Number(id), body as never)
    return { status: true, msg: '保存成功', data }
  }

  @Delete('info/:id')
  @RequirePermissions('assessment:info:manage')
  async deleteInfo(@Param('id') id: string) {
    const data = await this.assessmentService.deleteInfo(Number(id))
    return { status: true, msg: '删除成功', data }
  }

  @Post('info/:id/publish')
  @RequirePermissions('assessment:info:manage')
  async publishInfo(@Param('id') id: string) {
    const data = await this.assessmentService.publishInfo(Number(id), true)
    return { status: true, msg: '上架成功', data }
  }

  @Post('info/:id/unpublish')
  @RequirePermissions('assessment:info:manage')
  async unpublishInfo(@Param('id') id: string) {
    const data = await this.assessmentService.publishInfo(Number(id), false)
    return { status: true, msg: '下架成功', data }
  }

  // ---------- 渠道入口 ----------

  @Get('channel/list')
  @RequirePermissions('assessment:channel:list')
  async listChannels(@Query() query: Record<string, string>) {
    const data = await this.assessmentService.listChannels({
      keyword: query.keyword,
      source: query.source
    })
    return { status: true, msg: 'ok', data }
  }

  @Post('channel')
  @RequirePermissions('assessment:channel:manage')
  async createChannel(
    @Body() body: Record<string, unknown>,
    @CurrentUser() auth?: AuthInfo
  ) {
    const data = await this.assessmentService.createChannel(
      body as never,
      this.uid(auth)
    )
    return { status: true, msg: '创建成功', data }
  }

  @Put('channel/:id')
  @RequirePermissions('assessment:channel:manage')
  async updateChannel(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.assessmentService.updateChannel(
      Number(id),
      body as never
    )
    return { status: true, msg: '保存成功', data }
  }

  @Delete('channel/:id')
  @RequirePermissions('assessment:channel:manage')
  async deleteChannel(@Param('id') id: string) {
    const data = await this.assessmentService.deleteChannel(Number(id))
    return { status: true, msg: '删除成功', data }
  }

  // ---------- 回复规则 ----------

  @Get('reply/list')
  @RequirePermissions('assessment:reply:list')
  async listReplyRules(@Query() query: Record<string, string>) {
    const data = await this.assessmentService.listReplyRules({
      keyword: query.keyword,
      ruleType: query.ruleType
    })
    return { status: true, msg: 'ok', data }
  }

  @Post('reply')
  @RequirePermissions('assessment:reply:manage')
  async createReplyRule(
    @Body() body: Record<string, unknown>,
    @CurrentUser() auth?: AuthInfo
  ) {
    const data = await this.assessmentService.createReplyRule(
      body as never,
      this.uid(auth)
    )
    return { status: true, msg: '创建成功', data }
  }

  @Put('reply/:id')
  @RequirePermissions('assessment:reply:manage')
  async updateReplyRule(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.assessmentService.updateReplyRule(
      Number(id),
      body as never
    )
    return { status: true, msg: '保存成功', data }
  }

  @Delete('reply/:id')
  @RequirePermissions('assessment:reply:manage')
  async deleteReplyRule(@Param('id') id: string) {
    const data = await this.assessmentService.deleteReplyRule(Number(id))
    return { status: true, msg: '删除成功', data }
  }

  // ---------- 数据看板 ----------

  @Get('stats/overview')
  @RequirePermissions('assessment:stats:view')
  async statsOverview(@Query('days') days?: string) {
    const data = await this.assessmentService.statsOverview(days)
    return { status: true, msg: 'ok', data }
  }
}
