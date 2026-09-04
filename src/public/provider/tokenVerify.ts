import type { NextFunction, Request, Response } from 'express'
import Log from './log'
import {
  getAccessTokenFromRequest,
  initAccessTokenService,
  isTokenServiceReady,
  verifyAccessToken
} from '../../lib/access-token-service'

/**
 * 默认关闭（与历史行为一致）。
 * 需要开启时在 .env 设置 TOKEN_VERIFY=true
 */
const isOpenTokenVerify =
  process.env.TOKEN_VERIFY === 'true' || process.env.TOKEN_VERIFY === '1'

function getRequestPath(req: Request): string {
  return (req.originalUrl || req.url || '').split('?')[0]
}

function isPublicPath(req: Request): boolean {
  const path = getRequestPath(req)
  if (req.method === 'OPTIONS') return true

  const publicPatterns = [
    '/loginApi',
    '/api/loginApi',
    '/mysqlApi/login',
    '/api/mysqlApi/login',
    '/mysqlApi/register',
    '/api/mysqlApi/register'
  ]

  return publicPatterns.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`)
  )
}

void initAccessTokenService()

export function verifyToken(token: string) {
  return verifyAccessToken(token)
}

export function tokenVerify(req: Request, res: Response, next: NextFunction) {
  if (isPublicPath(req)) {
    next()
    return
  }

  const type = Log.LOG_TYPE.API
  Log.addLog(type, req.hostname, req.originalUrl, {
    module: getRequestPath(req).split('/')[1] || '',
    methods: getRequestPath(req).split('/').slice(-1)[0] || ''
  })

  const token = getAccessTokenFromRequest(req)

  if (isOpenTokenVerify) {
    if (!isTokenServiceReady()) {
      res.status(200).json({
        status: false,
        msg: 'token 服务未就绪，请检查 app_info 表中 draw_stars 配置',
        code: 'TOKEN-SERVICE-UNAVAILABLE'
      })
      return
    }

    if (!token) {
      res.status(200).json({
        status: false,
        msg: 'token验证未通过',
        code: 'TOKEN-FAIL'
      })
      return
    }

    const tokenInfo = verifyAccessToken(token)
    if (!tokenInfo) {
      res.status(200).json({
        status: false,
        msg: 'token验证未通过',
        code: 'TOKEN-FAIL'
      })
      return
    }

    req.auth = { ...tokenInfo, token }
  } else if (token) {
    const tokenInfo = verifyAccessToken(token)
    if (tokenInfo) {
      req.auth = { ...tokenInfo, token }
    }
  }

  next()
}
