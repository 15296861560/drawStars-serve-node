import { Module } from '@nestjs/common'
import { RbacService } from './rbac.service'
import { UserManageController } from './user-manage.controller'
import { RoleController } from './role.controller'
import { MenuController } from './menu.controller'
import { PermissionsGuard } from '../../common/guards/permissions.guard'

@Module({
  controllers: [UserManageController, RoleController, MenuController],
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService]
})
export class RbacModule {}
