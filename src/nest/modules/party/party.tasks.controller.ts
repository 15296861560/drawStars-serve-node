/**
 * 任务中心端点（PRD 4.10 / 7.1 REST）
 * #19 GET  /api/party/tasks        当日任务清单（进度/领取态 + 我的星光）
 * #20 POST /api/party/tasks/bump   真实行为进度上报（封顶幂等，body { key, inc? }）
 * #21 POST /api/party/tasks/claim  领取当日奖励（服务端入账 + 写 party_star_trans 流水）
 * 契约对齐小程序 utils/tasks.js（原本机账本）：在线后服务端为准；形内语义失败 { ok:false, msg }
 */
import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyRequestLike, resolveClientKey } from './party.util'
import { PartyTasksService } from './party.tasks.service'

@Public()
@RawResponse()
@Controller('party')
export class PartyTasksController {
  constructor(private readonly tasksService: PartyTasksService) {}

  @Get('tasks')
  list(@Req() request: PartyRequestLike) {
    return this.tasksService.list(resolveClientKey(request))
  }

  @Post('tasks/bump')
  bump(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.tasksService.bump(body || {}, resolveClientKey(request))
  }

  @Post('tasks/claim')
  claim(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.tasksService.claim(body || {}, resolveClientKey(request))
  }
}
