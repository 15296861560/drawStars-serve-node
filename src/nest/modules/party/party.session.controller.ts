/**
 * 星会会话控制器（端点 #1-#8）
 * - @Public + @RawResponse 类级：免鉴权 + 200 裸回包
 * - 声明顺序严格按契约（sessions/mine 需先于 sessions/:id）
 */
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartySessionService } from './party.session.service'
import { PartyRequestLike, resolveClientKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartySessionController {
  constructor(private readonly sessionService: PartySessionService) {}

  @Post('sessions')
  async create(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.sessionService.create(body, resolveClientKey(request))
  }

  @Get('sessions/mine')
  async mine(@Req() request: PartyRequestLike) {
    return this.sessionService.mine(resolveClientKey(request))
  }

  @Get('sessions/code/:code')
  async byCode(@Param('code') code: string, @Req() request: PartyRequestLike) {
    return this.sessionService.byCode(code, resolveClientKey(request))
  }

  @Get('sessions/:id/card')
  async card(@Param('id') id: string, @Req() request: PartyRequestLike) {
    return this.sessionService.card(id, resolveClientKey(request))
  }

  @Get('sessions/:id')
  async detail(@Param('id') id: string, @Req() request: PartyRequestLike) {
    return this.sessionService.detail(id, resolveClientKey(request))
  }

  @Post('sessions/:id/join')
  async join(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.sessionService.join(id, body, resolveClientKey(request))
  }

  @Patch('sessions/:id/ready')
  async setReady(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.sessionService.setReady(id, body, resolveClientKey(request))
  }

  @Patch('sessions/:id/host')
  async hostAction(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.sessionService.hostAction(id, body, resolveClientKey(request))
  }
}
