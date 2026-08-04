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

@Controller("userManageApi")
@UseGuards(PermissionsGuard)
export class UserManageController {
  constructor(private readonly rbacService: RbacService) {}

  @Get("list")
  @RequirePermissions("system:user:list")
  list(@Query() query: Record<string, string>) {
    return this.rbacService.listUsers(query);
  }

  @Get("detail/:id")
  @RequirePermissions("system:user:list")
  detail(@Param("id") id: string) {
    return this.rbacService.getUserDetail(Number(id));
  }

  @Post("create")
  @RequirePermissions("system:user:create")
  create(
    @Body()
    body: {
      name?: string;
      phone?: string;
      email?: string;
      password?: string;
      accountAlias?: string;
      status?: string;
      level?: number;
      roleIds?: number[];
    },
  ) {
    return this.rbacService.createUser(body);
  }

  @Put("update")
  @RequirePermissions("system:user:update")
  update(
    @Body()
    body: {
      id: number;
      name?: string;
      phone?: string;
      email?: string;
      accountAlias?: string;
      status?: string;
      level?: number;
      roleIds?: number[];
    },
  ) {
    return this.rbacService.updateUser(body);
  }

  @Delete("delete/:id")
  @RequirePermissions("system:user:delete")
  remove(@Param("id") id: string) {
    return this.rbacService.deleteUser(Number(id));
  }

  @Post("resetPassword")
  @RequirePermissions("system:user:update")
  resetPassword(@Body() body: { userId: number; password: string }) {
    return this.rbacService.resetPassword(Number(body.userId), body.password);
  }

  @Post("assignRoles")
  @RequirePermissions("system:user:assign")
  assignRoles(@Body() body: { userId: number; roleIds: number[] }) {
    return this.rbacService.assignRoles(
      Number(body.userId),
      body.roleIds || [],
    );
  }
}
