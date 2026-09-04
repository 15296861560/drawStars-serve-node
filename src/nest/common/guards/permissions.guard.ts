import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'
import { RbacService } from '../../modules/rbac/rbac.service'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (!required || required.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    let uid = request.auth?.uid ? Number(request.auth.uid) : null

    // Dev mode: TOKEN_VERIFY off — still try token or query for admin APIs
    if (!uid) {
      uid = this.rbacService.resolveUserIdFromRequest(request)
    }

    if (!uid) {
      throw new ForbiddenException('未登录，无法校验权限')
    }

    const { roleCodes, permissions } =
      await this.rbacService.getUserRoleAndPermissions(uid)

    if (roleCodes.includes('super_admin')) {
      request.auth = {
        ...(request.auth || {}),
        uid: String(uid),
        roleCodes,
        permissions
      }
      return true
    }

    const ok = required.some(code => permissions.includes(code))
    if (!ok) {
      throw new ForbiddenException('无操作权限')
    }

    request.auth = {
      ...(request.auth || {}),
      uid: String(uid),
      roleCodes,
      permissions
    }
    return true
  }
}
