import axios from 'axios'
import { getAppInfo } from '../../../db/app-info'

/**
 * 微信登录凭证约定：
 * - 小程序端（channel=mp）使用 app_info 表中 app_name='wechat_mp' 的记录
 *   （app_id=小程序 AppID，app_certificate=小程序 AppSecret，走 sns/jscode2session）
 * - App 端（channel=app）使用 app_info 表中 app_name='wechat_app' 的记录
 *   （app_id=微信开放平台移动应用 AppID，app_certificate=AppSecret，走 sns/oauth2）
 * 需手动向 app_info 表插入上述两行凭证后对应端才能真正打通
 */
type WechatChannel = 'mp' | 'app'

interface WechatSession {
  openid: string
  unionid?: string
  sessionKey?: string
}

class WechatProvider {
  mpAppId = ''
  mpSecret = ''
  appAppId = ''
  appSecret = ''

  private ready: Promise<void>

  constructor() {
    this.ready = this.init()
  }

  async init() {
    const [mpInfo, appInfo] = await Promise.all([
      getAppInfo('wechat_mp'),
      getAppInfo('wechat_app')
    ])
    if (mpInfo?.app_id && mpInfo?.app_certificate) {
      this.mpAppId = mpInfo.app_id
      this.mpSecret = mpInfo.app_certificate
    }
    if (appInfo?.app_id && appInfo?.app_certificate) {
      this.appAppId = appInfo.app_id
      this.appSecret = appInfo.app_certificate
    }
  }

  async getConfig(channel: WechatChannel) {
    await this.ready
    if (channel === 'app') {
      if (!this.appAppId || !this.appSecret) {
        throw '微信 App 登录未配置（缺 app_info wechat_app 凭证）'
      }
      return { appId: this.appAppId, secret: this.appSecret }
    }
    if (!this.mpAppId || !this.mpSecret) {
      throw '微信小程序登录未配置（缺 app_info wechat_mp 凭证）'
    }
    return { appId: this.mpAppId, secret: this.mpSecret }
  }

  /**
   * code 换 openid：
   * - mp: sns/jscode2session（小程序 uni.login 的 code）
   * - app: sns/oauth2/access_token（App uni.login oauth 'weixin' 的 code）
   * 微信接口恒返回 200，业务错误通过 errcode 表达，需显式校验。
   * session_key 仅用于后续接口调用，登录暂不落库（OauthInfo 无该字段）
   */
  async codeToSession(code: string, channel: WechatChannel) {
    if (!code) throw '微信授权 code 不能为空'
    const { appId, secret } = await this.getConfig(channel)

    const url =
      channel === 'app'
        ? 'https://api.weixin.qq.com/sns/oauth2/access_token'
        : 'https://api.weixin.qq.com/sns/jscode2session'
    const res = await axios.get(url, {
      params: {
        appid: appId,
        secret,
        grant_type: 'authorization_code',
        ...(channel === 'app' ? { code } : { js_code: code })
      }
    })

    const data = res.data as {
      openid?: string
      unionid?: string
      session_key?: string
      errcode?: number
      errmsg?: string
    }
    if (data.errcode || !data.openid) {
      throw `微信授权失败: ${data.errcode ?? ''} ${data.errmsg || 'no openid'}`
    }
    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key
    } as WechatSession
  }
}

export default new WechatProvider()
