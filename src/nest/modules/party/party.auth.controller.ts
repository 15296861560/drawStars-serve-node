/**
 * 登录注册控制器（PRD 7.1 /api/party/auth/login）：
 * - wx.login 静默 code 上送，后端持 AppSecret 换 openid 完成注册/登录
 * - @RawResponse：直接回 { token, user }，不套 { status, msg, data } 外壳
 * - 失败抛非 2xx，配合小程序 utils/api.js authLogin 的 catch 降级本机游客态
 */
import { Body, Controller, Post, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyAuthService } from './party.auth.service'
import { PartyRequestLike, resolveDeviceKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartyAuthController {
  constructor(private readonly authService: PartyAuthService) {}

  @Post('auth/login')
  async login(
    @Body() body: { code?: unknown } | null | undefined,
    @Req() request: PartyRequestLike
  ) {
    // 设备键随登录上送：游客期攒的星光/任务/对局在拿到正式身份时一次性并入
    return this.authService.login(body || {}, resolveDeviceKey(request.headers))
  }
}
