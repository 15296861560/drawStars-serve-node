/**
 * 星愿控制器（端点 #13-#16）：我的星愿 / 保存 / 星愿墙（裸数组）/ 点赞
 */
import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyWishService } from './party.wish.service'
import { PartyRequestLike, resolveClientKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartyWishController {
  constructor(private readonly wishService: PartyWishService) {}

  @Get('wish')
  async myWish(@Req() request: PartyRequestLike) {
    return this.wishService.myWish(resolveClientKey(request))
  }

  @Put('wish')
  async saveWish(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.wishService.saveWish(body, resolveClientKey(request))
  }

  @Get('wish/wall')
  async wall(@Req() request: PartyRequestLike) {
    return this.wishService.wall(resolveClientKey(request))
  }

  @Post('wish/:id/like')
  async like(@Param('id') id: string, @Req() request: PartyRequestLike) {
    return this.wishService.like(id, resolveClientKey(request))
  }
}
