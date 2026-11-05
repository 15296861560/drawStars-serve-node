/**
 * 登录注册（个人主体 · openid 口径，PRD 7.1 /api/party/auth）：
 * - 小程序 wx.login 静默 code → AppSecret（app_info.wechat_mp，永不下发前端）
 *   走 sns/jscode2session 换 openid，openid 与 oauth_info/user 平台账号一一对应
 * - 首次登录自动注册（昵称「星河旅人」），后续 party 业务走 tk_<uid> clientKey
 * - 业务失败一律抛非 2xx：客户端自动降级本机游客态，不影响其余接口在线探测
 * - 手机号相关：个人主体无法开通微信手机号快速验证组件，本链路不再涉及
 */
import { BadRequestException, HttpException, Injectable } from '@nestjs/common'
import { buildUserToken } from '../../../lib/access-token-service'
import wechatProvider from '../../../public/provider/oauth/wechatProvider'
import userService from '../../../public/service/userService'
import { PartyProfileService } from './party.profile.service'

/** 上游/凭证类故障统一以 502 透出 msg（客户端 catch 后降级本机游客态） */
function upstreamFail(e: unknown): HttpException {
  const msg = e instanceof Error ? e.message : String(e)
  return new HttpException(msg || '登录服务不可用', 502)
}

/** oauth_info 行 userId 归一化（serializeBigInt 后 userId/user_id 均可能存在） */
function oauthUserId(oauth: unknown): number {
  const row = (oauth as { userId?: unknown; user_id?: unknown }) || {}
  return Number(row.userId ?? row.user_id ?? 0)
}

@Injectable()
export class PartyAuthService {
  constructor(private readonly profileService: PartyProfileService) {}

  async login(body: { code?: unknown }) {
    const code = String((body && body.code) || '').trim()
    if (!code) throw new BadRequestException('缺少 wx.login code')

    // code 换 openid（复用 wechatProvider：小程序 channel=mp；凭证在 app_info.wechat_mp）
    let openid = ''
    try {
      const session = await wechatProvider.codeToSession(code, 'mp')
      openid = session.openid
    } catch (e) {
      throw upstreamFail(e)
    }

    // 平台账号 upsert：oauth_info 有则登录，无则注册（与 loginApi/loginByWechat 同口径）
    let uid = oauthUserId(await userService.queryByOauth(openid))
    if (!uid) {
      const now = Date.now()
      const registered = await userService
        .registerByOauth(
          {
            name: '星河旅人',
            createTime: now,
            updateTime: now,
            level: 1,
            status: 'active',
            smsLoginEnabled: true,
            oauthLoginEnabled: true
          },
          'wechat',
          openid
        )
        .catch(() => false)
      if (typeof registered === 'object' && registered.userId) {
        uid = Number(registered.userId)
      }
      if (!uid) {
        // 并发注册竞争兜底（registerByOauth 对「用户已注册」返回 false）
        uid = oauthUserId(await userService.queryByOauth(openid))
      }
      if (!uid) throw upstreamFail('注册失败')
    }

    // 签发 accessToken（AES 凭证服务，app_info.draw_stars 就绪后可用）
    const token = buildUserToken(uid)
    if (!token) throw upstreamFail('token 服务未就绪（app_info 缺 draw_stars 凭证）')

    // 派生 party 档案：clientKey 与 AuthGuard 解析口径一致（party.util authUidKey）
    const profile = await this.profileService.ensureProfile('tk_' + uid)

    return {
      token,
      user: {
        id: String(uid),
        name: profile.name,
        avatarUrl: profile.avatarUrl || ''
      }
    }
  }
}
