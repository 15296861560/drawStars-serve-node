/**
 * 星光档案控制器（端点 #17-#18）：profile / badges（badges 声明在 :param 类路径之前）
 */
import { Controller, Get, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyProfileService } from './party.profile.service'
import { PartyRequestLike, resolveClientKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartyProfileController {
  constructor(private readonly profileService: PartyProfileService) {}

  @Get('profile/badges')
  async badges(@Req() request: PartyRequestLike) {
    return this.profileService.getBadgeList(resolveClientKey(request))
  }

  @Get('profile')
  async profile(@Req() request: PartyRequestLike) {
    return this.profileService.getProfile(resolveClientKey(request))
  }
}
