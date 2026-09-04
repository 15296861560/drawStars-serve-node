import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map, Observable } from 'rxjs'
import { serializeBigInt } from '../../../lib/serialize'
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (isRaw) {
      return next.handle()
    }

    return next.handle().pipe(
      map((value: unknown) => {
        if (
          value &&
          typeof value === 'object' &&
          'status' in (value as Record<string, unknown>)
        ) {
          return serializeBigInt(value)
        }

        return serializeBigInt({
          status: true,
          msg: 'ok',
          data: value ?? null
        })
      })
    )
  }
}
