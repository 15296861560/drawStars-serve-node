/**
 * 星光排行榜端点（PRD 4.9 / 7.1 REST）
 * #22 GET /api/party/rank/board 星光总榜（top 30 + 我的坐标，日键随回包下发）
 * 契约对齐小程序 mock.mockRankBoard()：{ day, list: [{ name, starVal, me }] }
 */
import { Controller, Get, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyRequestLike, resolveClientKey } from './party.util'
import { PartyRankService } from './party.rank.service'

@Public()
@RawResponse()
@Controller('party')
export class PartyRankController {
  constructor(private readonly rankService: PartyRankService) {}

  @Get('rank/board')
  board(@Req() request: PartyRequestLike) {
    return this.rankService.board(resolveClientKey(request))
  }
}
