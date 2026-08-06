import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  getAccessTokenFromRequest,
  isTokenServiceReady,
  verifyAccessToken,
} from "../../../lib/access-token-service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

function isTokenVerifyEnabled() {
  return (
    process.env.TOKEN_VERIFY === "true" || process.env.TOKEN_VERIFY === "1"
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || !isTokenVerifyEnabled()) {
      // 公开接口 / 未强制验签时仍尽量解析 token，供填写端暂存等场景取 uid
      const request = context.switchToHttp().getRequest();
      const token = getAccessTokenFromRequest(request);
      if (token && isTokenServiceReady()) {
        const tokenInfo = verifyAccessToken(token);
        if (tokenInfo) {
          request.auth = { ...(request.auth || {}), ...tokenInfo, token };
        }
      }
      return true;
    }

    if (!isTokenServiceReady()) {
      throw new UnauthorizedException("token 服务未就绪");
    }

    const request = context.switchToHttp().getRequest();
    const token = getAccessTokenFromRequest(request);
    if (!token) {
      throw new UnauthorizedException("token验证未通过");
    }

    const tokenInfo = verifyAccessToken(token);
    if (!tokenInfo) {
      throw new UnauthorizedException("token验证未通过");
    }

    request.auth = { ...tokenInfo, token };
    return true;
  }
}
