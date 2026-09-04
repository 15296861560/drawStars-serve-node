import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import userService from '../../../public/service/userService'
import githubProvider from '../../../public/provider/oauth/githubProvider'
import config from '../../../config/publish-config'

@Public()
@Controller('loginApi')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Post('loginByPassword')
  async loginByPassword(
    @Body() body: { phone: string; password: string }
  ): Promise<unknown> {
    try {
      const data = await this.authService.loginByPassword(
        body.phone,
        body.password
      )
      return { status: true, msg: '登录成功', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('loginBySMS')
  async loginBySMS(@Body() body: { phone: string; captcha: string }) {
    try {
      const data = await this.authService.loginBySms(body.phone, body.captcha)
      return { status: true, msg: '登录成功', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('registerByPhone')
  async registerByPhone(@Body() body: Record<string, unknown>) {
    try {
      const nowDate = Date.now()
      const payload: Record<string, unknown> = {
        name: body.name || body.nickname,
        password: body.password,
        phone: body.phone,
        createTime: nowDate,
        updateTime: nowDate,
        level: 1,
        status: 'active',
        smsLoginEnabled: true,
        oauthLoginEnabled: true
      }
      const data = await this.authService.registerByPhone(payload)
      if (data && typeof data === 'object') {
        delete (data as { password?: string }).password
      }
      return { status: true, msg: '注册成功', data }
    } catch (error) {
      return {
        status: false,
        msg: `注册失败:${error instanceof Error ? error.message : String(error)}`,
        data: null
      }
    }
  }

  @Get('verifyLogin')
  async verifyLogin(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
    }
  ) {
    try {
      const data = await this.authService.verifyLogin(req)
      return { status: true, msg: 'ok', data }
    } catch {
      return { status: false, msg: 'fail', data: null }
    }
  }

  @Get('getCaptcha')
  async getCaptcha(
    @Query('account') account: string,
    @Query('type') type?: string
  ) {
    try {
      const result = await this.usersService.getCaptcha(
        account,
        type || 'login'
      )
      return {
        status: !!result.ok,
        msg: 'ok',
        data: {
          channel: result.channel,
          captcha: result.captcha,
          warning: (result as { warning?: string }).warning || null
        }
      }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('resetPassword')
  async resetPassword(
    @Body() body: { account: string; captcha: string; newPassword: string }
  ) {
    try {
      await this.usersService.resetPassword(body)
      return { status: true, msg: '密码重置成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('oauthLogin/github')
  @RawResponse()
  async oauthLoginGithub(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: { headers: Record<string, unknown> },
    @Res() res: unknown
  ) {
    const response = res as import('express').Response
    const referer = String(req.headers.referer || 'http://127.0.0.1:5173/')
    const frontendBase = referer.includes('/login')
      ? referer.replace(/\/login.*/, '/')
      : referer.endsWith('/')
        ? referer
        : `${referer}/`

    try {
      if (!code) {
        // 发起授权：无 code 时引导到 GitHub
        await githubProvider.init()
        if (!githubProvider.appID) {
          response.redirect(`${frontendBase}login?error=oauth_unavailable`)
          return
        }
        const redirectUri = encodeURIComponent(
          `http://127.0.0.1:${config.serve_port}/loginApi/oauthLogin/github`
        )
        const st = encodeURIComponent(state || 'login_1')
        response.redirect(
          `https://github.com/login/oauth/authorize?client_id=${githubProvider.appID}&scope=user&state=${st}&redirect_uri=${redirectUri}`
        )
        return
      }

      const accessToken = await githubProvider.getAccessToken(code, state)
      const githubUserInfo =
        await githubProvider.queryGithubUserInfo(accessToken)
      const decodedState = decodeURIComponent(state || '')

      // 绑定模式：state = bind_<userId>
      if (decodedState.startsWith('bind_')) {
        const userId = Number(decodedState.replace('bind_', ''))
        if (!userId) {
          throw new Error('无效的绑定用户')
        }
        const user = await this.usersService.queryUserInfo(userId)
        if (!user) throw new Error('用户不存在')
        if (user.oauthLoginEnabled === false) {
          throw new Error('未开启第三方快捷登录')
        }
        await this.usersService.bindOauthToUser(
          userId,
          'github',
          githubUserInfo.id
        )
        response.redirect(
          `${frontendBase}home/personalCenter/oauthBind?oauth=github&result=ok`
        )
        return
      }

      // 登录模式
      let oauthInfo = await userService.queryByOauth(githubUserInfo.id)
      const nowDate = Date.now()
      const resultData: Record<string, unknown> = {
        name: githubUserInfo.login,
        phone: githubUserInfo.login,
        createTime: nowDate,
        updateTime: nowDate,
        level: 1,
        avatar: githubUserInfo.avatar_url,
        status: 'active'
      }

      if (!oauthInfo) {
        const registered = await userService.registerByOauth(
          resultData,
          'github',
          githubUserInfo.id
        )
        if (!registered) {
          throw new Error('oauth注册失败')
        }
        resultData.id = registered.userId
      } else {
        const boundUserId =
          (oauthInfo as { userId?: number; user_id?: number }).userId ??
          (oauthInfo as { user_id?: number }).user_id
        resultData.id = boundUserId
        const existing = await this.usersService.queryUserInfo(
          Number(boundUserId)
        )
        if (!existing) throw new Error('账号不存在')
        await this.usersService.assertAccountActive(existing)
        if (existing.oauthLoginEnabled === false) {
          throw new Error('未开启第三方快捷登录')
        }
        Object.assign(resultData, {
          name: existing.name,
          avatar: existing.avatar || githubUserInfo.avatar_url,
          phone: existing.phone
        })
      }

      userService.setToken(resultData as never)
      delete resultData.password
      const returnUrl = `${frontendBase}login?accessToken=${encodeURIComponent(String(resultData.token))}`
      response.redirect(returnUrl)
    } catch (e) {
      console.error('oauthLogin github error', e)
      response.redirect(`${frontendBase}login?error=1`)
    }
  }
}
