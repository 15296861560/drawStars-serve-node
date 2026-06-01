import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { catchError, Observable, tap, throwError } from "rxjs";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, url } = request;
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        console.log(
          `[${method}] ${originalUrl || url} ${Date.now() - started}ms`,
        );
      }),
      catchError((error) => {
        console.error(
          `[${method}] ${originalUrl || url} failed in ${Date.now() - started}ms`,
          error,
        );
        return throwError(() => error);
      }),
    );
  }
}
