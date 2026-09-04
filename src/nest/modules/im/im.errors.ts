import { HttpException } from '@nestjs/common'
import { IM_ERROR_MAP, ImErrorCode } from './im.constants'

export { ImErrorCode } from './im.constants'

/**
 * IM 业务异常：携带 PRD §4.13 错误码与 HTTP 状态。
 * 由 AllExceptionsFilter / ResponseInterceptor 兜底转换；这里抛出后 controller 也可直接处理。
 */
export class ImException extends HttpException {
  readonly imCode: ImErrorCode
  readonly imMessage: string

  constructor(code: ImErrorCode, message?: string) {
    const meta = IM_ERROR_MAP[code]
    super(
      {
        status: false,
        code: meta.code,
        msg: message || meta.message,
        data: null
      },
      meta.httpStatus
    )
    this.imCode = code
    this.imMessage = message || meta.message
  }
}

export function isImException(e: unknown): e is ImException {
  return e instanceof ImException
}
