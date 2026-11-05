/**
 * 星光档案控制器（端点 #17-#18 + 我的信息改档）：
 * - badges 声明在 :param 类路径之前
 * - 改名（业务错误统一 200 + { ok:false, msg }）
 * - 手机号换绑已下线（个人主体无法开通微信手机号快速验证组件，注册标识改走 openid）
 */
import { Body, Controller, Get, Patch, Req } from '@nestjs/common'
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

  /** 我的信息：改名（昵称 ≤32 字；avatarUrl 为 wxfile:// 本机路径，仅本机展示，入参被忽略），成功回最新 profile 全量 */
  @Patch('profile')
  async updateProfile(
    @Body() body: Record<string, unknown> | null | undefined,
    @Req() request: PartyRequestLike
  ) {
    return this.profileService.updateProfile(resolveClientKey(request), body)
  }
}
