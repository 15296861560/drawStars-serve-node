import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RbacService } from "./rbac.service";

@Controller("menuApi")
export class MenuController {
  constructor(private readonly rbacService: RbacService) {}

  @Get("tree")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:menu:list", "system:role:bind", "system:role:list")
  tree() {
    return this.rbacService.getMenuTree(true);
  }

  @Get("detail/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:menu:list")
  detail(@Param("id") id: string) {
    return this.rbacService.getMenuDetail(Number(id));
  }

  @Post("create")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:menu:create")
  create(
    @Body()
    body: {
      parentId?: number;
      name: string;
      type: number;
      path?: string;
      component?: string;
      permission?: string;
      icon?: string;
      sort?: number;
      visible?: number;
      status?: number;
    },
  ) {
    return this.rbacService.createMenu(body);
  }

  @Put("update")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:menu:update")
  update(
    @Body()
    body: {
      id: number;
      parentId?: number;
      name?: string;
      type?: number;
      path?: string;
      component?: string;
      permission?: string;
      icon?: string;
      sort?: number;
      visible?: number;
      status?: number;
    },
  ) {
    return this.rbacService.updateMenu(body);
  }

  @Delete("delete/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:menu:delete")
  remove(@Param("id") id: string) {
    return this.rbacService.deleteMenu(Number(id));
  }

  /** Current user visible menus (login required via token or query userId in dev) */
  @Get("userMenus")
  async userMenus(
    @Req()
    req: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
  ) {
    const userId = this.rbacService.resolveUserIdFromRequest(req);
    if (!userId) {
      return { status: false, msg: "缺少用户信息", data: [] };
    }
    return this.rbacService.getUserMenus(userId);
  }

  @Get("userPermissions")
  async userPermissions(
    @Req()
    req: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
  ) {
    const userId = this.rbacService.resolveUserIdFromRequest(req);
    if (!userId) {
      return { status: false, msg: "缺少用户信息", data: { roles: [], permissions: [] } };
    }
    return this.rbacService.getUserPermissions(userId);
  }
}
