/**
 * 星光档案控制器（端点 #17-#18 + 我的信息三端点）：
 * - badges 声明在 :param 类路径之前
 * - 改名 / 手机号换绑（验证码走榛子短信链路，业务错误统一 200 + { ok:false, msg }）
 */
import { Body, Controller, Get, Patch, Post, Put, Req } from '@nestjs/common'
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

  /** 我的信息：改名（昵称 ≤32 字），成功回最新 profile 全量 */
  @Patch('profile')
  async updateProfile(
    @Body() body: Record<string, unknown> | null | undefined,
    @Req() request: PartyRequestLike
  ) {
    return this.profileService.updateProfile(resolveClientKey(request), body)
  }

  /** 换绑第一步：向新手机号发验证码（短信不可用时回显 captcha 兜底） */
  @Post('profile/phone/code')
  async sendPhoneCode(@Body() body: Record<string, unknown> | null | undefined) {
    return this.profileService.sendPhoneCode(body && body.phone)
  }

  /** 换绑第二步：验码通过后落库新手机号 */
  @Put('profile/phone')
  async changePhone(
    @Body() body: Record<string, unknown> | null | undefined,
    @Req() request: PartyRequestLike
  ) {
    return this.profileService.changePhone(
      resolveClientKey(request),
      body && body.phone,
      body && body.captcha
    )
  }
}
