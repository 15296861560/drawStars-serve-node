import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import { serializeBigInt } from "../../../lib/serialize";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          value &&
          typeof value === "object" &&
          "status" in (value as Record<string, unknown>)
        ) {
          return serializeBigInt(value);
        }

        return serializeBigInt({
          status: true,
          msg: "ok",
          data: value ?? null,
        });
      }),
    );
  }
}
