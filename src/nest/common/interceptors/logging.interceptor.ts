import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { catchError, Observable, tap, throwError } from "rxjs";
import Log, { LOG_TYPE } from "../../../public/provider/log";
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../../../lib/access-token-service";

/** 超过该耗时（ms）的请求额外记入性能日志 */
const PERF_THRESHOLD_MS = 300;

/** 避免日志接口自身递归写日志 */
const SKIP_PREFIXES = ["/logApi/", "/analyticsApi/collect"];

/** 这些请求额外记入操作日志 */
const OPERATE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function shouldSkipPersist(url: string) {
  return SKIP_PREFIXES.some((p) => url.includes(p));
}

function getClientIp(request: {
  headers: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip || request.socket?.remoteAddress || "";
}

/** 即便未开启 TOKEN_VERIFY，也尽量从 token / body 解析操作用户 */
function resolveUsername(request: {
  auth?: { uid?: string | number };
  body?: Record<string, unknown>;
  headers: Record<string, unknown>;
}): string {
  if (request.auth?.uid != null && String(request.auth.uid)) {
    return String(request.auth.uid);
  }

  const token = getAccessTokenFromRequest(request as Parameters<typeof getAccessTokenFromRequest>[0]);
  if (token) {
    const tokenInfo = verifyAccessToken(token);
    if (tokenInfo && tokenInfo.uid) {
      request.auth = { ...(request.auth || {}), uid: tokenInfo.uid };
      return String(tokenInfo.uid);
    }
  }

  const body = request.body || {};
  const fromBody =
    body.name || body.username || body.account || body.accountAlias || body.phone;
  return fromBody != null ? String(fromBody) : "";
}

function sanitizeBody(body: Record<string, unknown>) {
  const clone: Record<string, unknown> = { ...body };
  for (const key of Object.keys(clone)) {
    if (/password|pwd|token|secret/i.test(key)) {
      clone[key] = "***";
    }
  }
  return clone;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, url, hostname, body, query } = request;
    const path = originalUrl || url || "";
    const started = Date.now();
    const skipPersist = shouldSkipPersist(path);

    const baseContent = () => ({
      username: resolveUsername(request),
      method,
      operation: method,
      path,
      ip: getClientIp(request),
      params: {
        query: query || {},
        body: body && typeof body === "object" ? sanitizeBody(body) : body,
      },
    });

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - started;
        console.log(`[${method}] ${path} ${duration}ms`);

        if (skipPersist) return;

        const statusFromData =
          data && typeof data === "object" && "status" in (data as object)
            ? (data as { status?: boolean }).status === false
              ? "fail"
              : "success"
            : "success";

        const content = {
          ...baseContent(),
          duration,
          status: statusFromData,
          statusCode: 200,
          msg: statusFromData === "success" ? "ok" : "fail",
        };

        Log.addLog(LOG_TYPE.API, hostname || "", path, content);

        if (OPERATE_METHODS.has(String(method || "").toUpperCase())) {
          Log.addLog(LOG_TYPE.OPERATE, hostname || "", path, {
            ...content,
            operation: `${method} ${path}`,
          });
        }

        if (duration >= PERF_THRESHOLD_MS) {
          Log.addLog(LOG_TYPE.PERFORMANCE, hostname || "", path, {
            ...content,
            title: "慢接口",
            type: "slow",
            threshold: PERF_THRESHOLD_MS,
          });
        }
      }),
      catchError((error) => {
        const duration = Date.now() - started;
        console.error(`[${method}] ${path} failed in ${duration}ms`, error);

        if (!skipPersist) {
          const content = {
            ...baseContent(),
            duration,
            status: "fail",
            statusCode: error?.status || 500,
            msg: error instanceof Error ? error.message : String(error),
            errorMsg: error instanceof Error ? error.message : String(error),
          };
          Log.addLog(LOG_TYPE.API, hostname || "", path, content);
          if (OPERATE_METHODS.has(String(method || "").toUpperCase())) {
            Log.addLog(LOG_TYPE.OPERATE, hostname || "", path, {
              ...content,
              operation: `${method} ${path}`,
            });
          }
          if (duration >= PERF_THRESHOLD_MS) {
            Log.addLog(LOG_TYPE.PERFORMANCE, hostname || "", path, {
              ...content,
              title: "慢接口异常",
              type: "slow_error",
              threshold: PERF_THRESHOLD_MS,
            });
          }
        }

        return throwError(() => error);
      }),
    );
  }
}
