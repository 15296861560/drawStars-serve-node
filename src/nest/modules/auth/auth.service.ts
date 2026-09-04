import { Injectable } from '@nestjs/common'
import userService from '../../../public/service/userService'
import { getAccessTokenFromRequest } from '../../../lib/access-token-service'

@Injectable()
export class AuthService {
  async loginByPassword(phone: string, password: string) {
    return userService.loginByPassword(phone, password)
  }

  async loginBySms(phone: string, captcha: string) {
    return userService.smsLogin(phone, captcha)
  }

  async registerByPhone(payload: Record<string, unknown>) {
    const userId = await userService.registerByPhone(payload)
    payload.id = userId
    userService.setToken(payload)
    return payload
  }

  async verifyLogin(request: {
    headers: Record<string, unknown>
    query: Record<string, unknown>
    cookies?: Record<string, string>
  }) {
    let token = getAccessTokenFromRequest(request as never)
    if (!token && request.query?.accessToken) {
      token = decodeURIComponent(String(request.query.accessToken))
    }
    if (!token && request.cookies?.accessToken) {
      token = request.cookies.accessToken
    }
    if (!token) {
      throw new Error('fail')
    }
    return userService.verifyLogin(token)
  }

  async getCaptcha(account: string, type = 'login') {
    return userService.getCaptcha(account, type)
  }
}
