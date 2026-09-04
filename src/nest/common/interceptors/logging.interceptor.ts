import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common'
import { catchError, Observable, tap, throwError } from 'rxjs'
import Log, { LOG_TYPE } from '../../../public/provider/log'
import {
  inferOperationType,
  normalizeHttpMethod
} from '../../../public/provider/log-operation'
import {
  getAccessTokenFromRequest,
  verifyAccessToken
} from '../../../lib/access-token-service'
import { PrismaService } from '../../prisma/prisma.service'

/** 超过该耗时（ms）的请求额外记入性能日志 */
const PERF_THRESHOLD_MS = 300

/** 避免日志接口自身递归写日志 */
const SKIP_PREFIXES = ['/logApi/', '/analyticsApi/collect']

/** 这些请求额外记入操作日志 */
const OPERATE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** uid → 展示名缓存，减少高频写日志时的用户表查询 */
const NAME_CACHE = new Map<string, { name: string; expireAt: number }>()
const NAME_CACHE_TTL_MS = 5 * 60 * 1000

function shouldSkipPersist(url: string) {
  return SKIP_PREFIXES.some(p => url.includes(p))
}

function getClientIp(request: {
  headers: Record<string, unknown>
  ip?: string
  socket?: { remoteAddress?: string }
}) {
  const forwarded = request.headers['x-forwarded-for']
  let ip = ''
  if (typeof forwarded === 'string' && forwarded) {
    ip = forwarded.split(',')[0].trim()
  } else {
    ip = request.ip || request.socket?.remoteAddress || ''
  }
  // Node 在 IPv6 双栈下会把 IPv4 写成 ::ffff:x.x.x.x
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7)
  }
  return ip
}

function displayNameFromUser(
  user: {
    name: string | null
    accountAlias: string | null
    phone: string | null
  } | null
): string {
  if (!user) return ''
  return (
    user.name?.trim() || user.accountAlias?.trim() || user.phone?.trim() || ''
  )
}

function resolveUid(request: {
  auth?: { uid?: string | number }
  headers: Record<string, unknown>
}): string {
  if (request.auth?.uid != null && String(request.auth.uid)) {
    return String(request.auth.uid)
  }

  const token = getAccessTokenFromRequest(
    request as Parameters<typeof getAccessTokenFromRequest>[0]
  )
  if (token) {
    const tokenInfo = verifyAccessToken(token)
    if (tokenInfo && tokenInfo.uid) {
      request.auth = { ...(request.auth || {}), uid: tokenInfo.uid }
      return String(tokenInfo.uid)
    }
  }
  return ''
}

function sanitizeBody(body: Record<string, unknown>) {
  const clone: Record<string, unknown> = { ...body }
  for (const key of Object.keys(clone)) {
    if (/password|pwd|token|secret/i.test(key)) {
      clone[key] = '***'
    }
  }
  return clone
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest()
    const { method, originalUrl, url, hostname, body, query } = request
    const rawUrl = String(originalUrl || url || '')
    /** 接口路径不含 query，参数单独写入 content.params */
    const path = rawUrl.split('?')[0] || ''
    const httpMethod =
      normalizeHttpMethod(method) || String(method || '').toUpperCase()
    const operation = inferOperationType(httpMethod, path)
    const started = Date.now()
    const skipPersist = shouldSkipPersist(path)

    const buildContent = async (extra: Record<string, unknown>) => {
      const { uid, username } = await this.resolveOperator(request)
      return {
        username,
        uid: uid || undefined,
        method: httpMethod,
        operation,
        path,
        ip: getClientIp(request),
        params: {
          query: query || {},
          body: body && typeof body === 'object' ? sanitizeBody(body) : body
        },
        ...extra
      }
    }

    return next.handle().pipe(
      tap(data => {
        const duration = Date.now() - started
        console.log(`[${httpMethod}] ${path} ${duration}ms`)

        if (skipPersist) return

        const statusFromData =
          data && typeof data === 'object' && 'status' in (data as object)
            ? (data as { status?: boolean }).status === false
              ? 'fail'
              : 'success'
            : 'success'

        void this.persistLogs({
          hostname: hostname || '',
          path,
          method: httpMethod,
          duration,
          buildContent,
          status: statusFromData,
          statusCode: 200,
          msg: statusFromData === 'success' ? 'ok' : 'fail'
        })
      }),
      catchError(error => {
        const duration = Date.now() - started
        console.error(`[${httpMethod}] ${path} failed in ${duration}ms`, error)

        if (!skipPersist) {
          void this.persistLogs({
            hostname: hostname || '',
            path,
            method: httpMethod,
            duration,
            buildContent,
            status: 'fail',
            statusCode: error?.status || 500,
            msg: error instanceof Error ? error.message : String(error),
            errorMsg: error instanceof Error ? error.message : String(error),
            perfTitle: '慢接口异常',
            perfType: 'slow_error'
          })
        }

        return throwError(() => error)
      })
    )
  }

  private async persistLogs(input: {
    hostname: string
    path: string
    method: string
    duration: number
    buildContent: (
      extra: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
    status: string
    statusCode: number
    msg: string
    errorMsg?: string
    perfTitle?: string
    perfType?: string
  }) {
    const content = await input.buildContent({
      duration: input.duration,
      status: input.status,
      statusCode: input.statusCode,
      msg: input.msg,
      ...(input.errorMsg ? { errorMsg: input.errorMsg } : {})
    })

    Log.addLog(LOG_TYPE.API, input.hostname, input.path, content)

    if (OPERATE_METHODS.has(String(input.method || '').toUpperCase())) {
      // method=HTTP 动词，operation=语义类型（insert/update/login...）
      Log.addLog(LOG_TYPE.OPERATE, input.hostname, input.path, content)
    }

    if (input.duration >= PERF_THRESHOLD_MS) {
      Log.addLog(LOG_TYPE.PERFORMANCE, input.hostname, input.path, {
        ...content,
        title: input.perfTitle || '慢接口',
        type: input.perfType || 'slow',
        threshold: PERF_THRESHOLD_MS
      })
    }
  }

  /** 解析操作用户：优先真实展示名，uid 仅作兜底 */
  private async resolveOperator(request: {
    auth?: { uid?: string | number }
    body?: Record<string, unknown>
    headers: Record<string, unknown>
  }): Promise<{ uid: string; username: string }> {
    const uid = resolveUid(request)
    if (uid) {
      const name = await this.lookupUserDisplayName(uid)
      if (name) return { uid, username: name }
      return { uid, username: uid }
    }

    const body = request.body || {}
    const fromBody =
      body.name ||
      body.username ||
      body.account ||
      body.accountAlias ||
      body.phone
    return {
      uid: '',
      username: fromBody != null ? String(fromBody) : ''
    }
  }

  private async lookupUserDisplayName(uid: string): Promise<string> {
    const cached = NAME_CACHE.get(uid)
    if (cached && cached.expireAt > Date.now()) {
      return cached.name
    }

    try {
      const id = BigInt(uid)
      const user = await this.prisma.client.user.findFirst({
        where: { id, deletedAt: null },
        select: { name: true, accountAlias: true, phone: true }
      })
      const name = displayNameFromUser(user)
      if (name) {
        NAME_CACHE.set(uid, {
          name,
          expireAt: Date.now() + NAME_CACHE_TTL_MS
        })
      }
      return name
    } catch {
      return ''
    }
  }
}
