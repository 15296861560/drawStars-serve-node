/**
 * 登录注册控制器（PRD 7.1 /api/party/auth/login）：
 * - wx.login 静默 code 上送，后端持 AppSecret 换 openid 完成注册/登录
 * - @RawResponse：直接回 { token, user }，不套 { status, msg, data } 外壳
 * - 失败抛非 2xx，配合小程序 utils/api.js authLogin 的 catch 降级本机游客态
 */
import { Body, Controller, Post } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyAuthService } from './party.auth.service'

@Public()
@RawResponse()
@Controller('party')
export class PartyAuthController {
  constructor(private readonly authService: PartyAuthService) {}

  @Post('auth/login')
  async login(@Body() body: { code?: unknown } | null | undefined) {
    return this.authService.login(body || {})
  }
}
