import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      const message =
        typeof payload === 'string'
          ? payload
          : (payload as { message?: string }).message || exception.message

      response.status(status).json({
        status: false,
        msg: message || '请求失败',
        code:
          status === HttpStatus.UNAUTHORIZED ? 'TOKEN-FAIL' : 'REQUEST-ERROR',
        data: null
      })
      return
    }

    const message =
      exception instanceof Error ? exception.message : '服务器内部错误'
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: false,
      msg: message,
      code: 'INTERNAL_ERROR',
      data: null
    })
  }
}
