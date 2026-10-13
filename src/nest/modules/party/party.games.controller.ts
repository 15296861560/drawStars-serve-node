/**
 * 星会小游戏控制器（端点 #9-#12）：tod 抽题 / draw 词条 / bluff 命题 / dice 摇骰
 */
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyGamesService } from './party.games.service'
import { PartyRequestLike, resolveClientKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartyGamesController {
  constructor(private readonly gamesService: PartyGamesService) {}

  @Post('games/tod/draw')
  async todDraw(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.gamesService.todDraw(body, resolveClientKey(request))
  }

  @Get('games/draw/words')
  async drawWords(@Query() query: Record<string, unknown>) {
    return this.gamesService.drawWords(query)
  }

  @Get('games/bluff/prompts')
  async bluffPrompts(@Query() query: Record<string, unknown>) {
    return this.gamesService.bluffPrompts(query)
  }

  @Post('games/dice/shake')
  async diceShake(@Body() body: Record<string, unknown>) {
    return this.gamesService.diceShake(body)
  }
}
