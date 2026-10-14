/**
 * Admin 域控制器（PRD 7.1.4 七组端点 + 玩家举报上报）
 * - 鉴权：x-admin-key 单 key（单 key 全域放行，RBAC 六码留待 drawStars-Vue3 接入）
 * - 回包：全部 {code, msg, data}（业务码 0 = 成功）；鉴权失败 HTTP 403
 * - 路由经 main.ts 剥 /api 前缀后实际匹配 party/admin/...
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyAdminService } from './party.admin.service'

@Public()
@RawResponse()
@Controller('party/admin')
export class PartyAdminController {
  constructor(private readonly adminService: PartyAdminService) {}

  private assertKey(key: string) {
    if (!this.adminService.checkAdminKey(key)) {
      throw new ForbiddenException('invalid x-admin-key')
    }
  }

  /* ---------- 题目池（party:question:manage） ---------- */
  @Get('questions')
  async listQuestions(
    @Headers('x-admin-key') key: string,
    @Query() query: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.listQuestions(query)
  }

  @Post('questions')
  async createQuestions(
    @Headers('x-admin-key') key: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.createQuestions(body)
  }

  @Put('questions/:id')
  async updateQuestion(
    @Headers('x-admin-key') key: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.updateQuestion(id, body)
  }

  @Delete('questions/:id')
  async deleteQuestion(@Headers('x-admin-key') key: string, @Param('id') id: string) {
    this.assertKey(key)
    return this.adminService.deleteQuestion(id)
  }

  /* ---------- 词库（party:question:manage） ---------- */
  @Get('wordbank')
  async listWordbank(@Headers('x-admin-key') key: string, @Query() query: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.listWordbank(query)
  }

  @Post('wordbank')
  async createWordbank(@Headers('x-admin-key') key: string, @Body() body: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.createWordbank(body)
  }

  @Put('wordbank/:id')
  async updateWordbank(
    @Headers('x-admin-key') key: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.updateWordbank(id, body)
  }

  @Delete('wordbank/:id')
  async deleteWordbank(@Headers('x-admin-key') key: string, @Param('id') id: string) {
    this.assertKey(key)
    return this.adminService.deleteWordbank(id)
  }

  /* ---------- 主题标签（party:theme:manage） ---------- */
  @Get('themes')
  async listThemes(@Headers('x-admin-key') key: string, @Query() query: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.listThemes(query)
  }

  @Post('themes')
  async createTheme(@Headers('x-admin-key') key: string, @Body() body: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.createTheme(body)
  }

  @Put('themes/:id')
  async updateTheme(
    @Headers('x-admin-key') key: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.updateTheme(id, body)
  }

  @Delete('themes/:id')
  async deleteTheme(@Headers('x-admin-key') key: string, @Param('id') id: string) {
    this.assertKey(key)
    return this.adminService.deleteTheme(id)
  }

  /* ---------- 游戏配置（party:game:config；session.create 消费开关） ---------- */
  @Get('game-config')
  async listGameConfig(@Headers('x-admin-key') key: string) {
    this.assertKey(key)
    return this.adminService.listGameConfig()
  }

  @Patch('game-config/:gameType')
  async updateGameConfig(
    @Headers('x-admin-key') key: string,
    @Param('gameType') gameType: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.updateGameConfig(gameType, body)
  }

  /* ---------- 对局查询（party:session:view） ---------- */
  @Get('sessions')
  async listSessions(@Headers('x-admin-key') key: string, @Query() query: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.listSessions(query)
  }

  @Get('sessions/:id')
  async getSessionDetail(@Headers('x-admin-key') key: string, @Param('id') id: string) {
    this.assertKey(key)
    return this.adminService.getSessionDetail(id)
  }

  /* ---------- 数据统计（party:stats:view） ---------- */
  @Get('stats')
  async stats(@Headers('x-admin-key') key: string, @Query() query: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.stats(query)
  }

  /* ---------- 内容审核（party:content:audit；状态机 pending→reviewing→closed） ---------- */
  @Get('reports')
  async listReports(@Headers('x-admin-key') key: string, @Query() query: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.listReports(query)
  }

  @Post('reports')
  async createReport(@Headers('x-admin-key') key: string, @Body() body: Record<string, unknown>) {
    this.assertKey(key)
    return this.adminService.createReport(body)
  }

  @Patch('reports/:id')
  async handleReport(
    @Headers('x-admin-key') key: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    this.assertKey(key)
    return this.adminService.handleReport(id, body)
  }
}
