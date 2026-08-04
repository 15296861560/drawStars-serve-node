import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RbacService } from "./rbac.service";

@Controller("roleApi")
@UseGuards(PermissionsGuard)
export class RoleController {
  constructor(private readonly rbacService: RbacService) {}

  @Get("list")
  @RequirePermissions("system:role:list", "system:user:list")
  list(@Query() query: Record<string, string>) {
    return this.rbacService.listRoles(query);
  }

  @Get("detail/:id")
  @RequirePermissions("system:role:list")
  detail(@Param("id") id: string) {
    return this.rbacService.getRoleDetail(Number(id));
  }

  @Post("create")
  @RequirePermissions("system:role:create")
  create(
    @Body()
    body: {
      name: string;
      code: string;
      remark?: string;
      status?: number;
      sort?: number;
    },
  ) {
    return this.rbacService.createRole(body);
  }

  @Put("update")
  @RequirePermissions("system:role:update")
  update(
    @Body()
    body: {
      id: number;
      name?: string;
      code?: string;
      remark?: string;
      status?: number;
      sort?: number;
    },
  ) {
    return this.rbacService.updateRole(body);
  }

  @Delete("delete/:id")
  @RequirePermissions("system:role:delete")
  remove(@Param("id") id: string) {
    return this.rbacService.deleteRole(Number(id));
  }

  @Get("menuIds/:roleId")
  @RequirePermissions("system:role:list", "system:role:bind")
  menuIds(@Param("roleId") roleId: string) {
    return this.rbacService.getRoleMenuIds(Number(roleId));
  }

  @Post("bindMenus")
  @RequirePermissions("system:role:bind")
  bindMenus(@Body() body: { roleId: number; menuIds: number[] }) {
    return this.rbacService.bindMenus(Number(body.roleId), body.menuIds || []);
  }
}
