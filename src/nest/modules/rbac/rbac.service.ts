import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeBigInt } from "../../../lib/serialize";
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../../../lib/access-token-service";

export type MenuTreeNode = {
  id: number;
  parentId: number;
  name: string;
  type: number;
  path: string | null;
  component: string | null;
  permission: string | null;
  icon: string | null;
  sort: number;
  visible: number;
  status: number;
  createTime: number | null;
  updateTime: number | null;
  children?: MenuTreeNode[];
};

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  resolveUserIdFromRequest(request: {
    headers?: Record<string, unknown>;
    query?: Record<string, unknown>;
    cookies?: Record<string, string>;
    auth?: { uid?: string };
    body?: { userId?: number | string };
  }): number | null {
    if (request.auth?.uid) return Number(request.auth.uid);
    const token = getAccessTokenFromRequest(request as never);
    if (token) {
      const info = verifyAccessToken(token);
      if (info && info.uid) return Number(info.uid);
    }
    const q = request.query?.userId ?? request.query?.id;
    if (q !== undefined && q !== null && q !== "") return Number(q);
    if (request.body?.userId !== undefined && request.body?.userId !== null) {
      return Number(request.body.userId);
    }
    return null;
  }

  async getUserRoleAndPermissions(userId: number) {
    const rows = await this.prisma.client.sysUserRole.findMany({
      where: { userId: BigInt(userId) },
      include: {
        role: {
          include: {
            roleMenus: {
              include: { menu: true },
            },
          },
        },
      },
    });

    const roleCodes: string[] = [];
    const roleNames: string[] = [];
    const permissionSet = new Set<string>();

    for (const row of rows) {
      if (!row.role || row.role.status !== 1) continue;
      roleCodes.push(row.role.code);
      roleNames.push(row.role.name);
      for (const rm of row.role.roleMenus) {
        const perm = rm.menu?.permission;
        if (perm && rm.menu.status === 1) permissionSet.add(perm);
      }
    }

    // 超级管理员默认拥有全部权限码（不依赖 sys_role_menu 是否同步）
    if (roleCodes.includes("super_admin")) {
      const all = await this.prisma.client.sysMenu.findMany({
        where: { status: 1, permission: { not: null } },
        select: { permission: true },
      });
      for (const m of all) {
        if (m.permission) permissionSet.add(m.permission);
      }
    }

    return {
      roleCodes,
      roleNames,
      permissions: [...permissionSet],
    };
  }

  async getUserMenuIds(userId: number): Promise<bigint[]> {
    const { roleCodes } = await this.getUserRoleAndPermissions(userId);
    if (roleCodes.includes("super_admin")) {
      const all = await this.prisma.client.sysMenu.findMany({
        where: { status: 1 },
        select: { id: true },
      });
      return all.map((m) => m.id);
    }

    const rows = await this.prisma.client.sysUserRole.findMany({
      where: { userId: BigInt(userId) },
      include: {
        role: {
          include: { roleMenus: true },
        },
      },
    });

    const ids = new Set<bigint>();
    for (const row of rows) {
      if (!row.role || row.role.status !== 1) continue;
      for (const rm of row.role.roleMenus) ids.add(rm.menuId);
    }
    return [...ids];
  }

  buildMenuTree(
    menus: Array<{
      id: bigint;
      parentId: bigint;
      name: string;
      type: number;
      path: string | null;
      component: string | null;
      permission: string | null;
      icon: string | null;
      sort: number;
      visible: number;
      status: number;
      createTime: bigint | null;
      updateTime: bigint | null;
    }>,
    parentId = BigInt(0),
  ): MenuTreeNode[] {
    return menus
      .filter((m) => m.parentId === parentId)
      .sort((a, b) => a.sort - b.sort)
      .map((m) => {
        const node: MenuTreeNode = {
          id: Number(m.id),
          parentId: Number(m.parentId),
          name: m.name,
          type: m.type,
          path: m.path,
          component: m.component,
          permission: m.permission,
          icon: m.icon,
          sort: m.sort,
          visible: m.visible,
          status: m.status,
          createTime: m.createTime != null ? Number(m.createTime) : null,
          updateTime: m.updateTime != null ? Number(m.updateTime) : null,
        };
        const children = this.buildMenuTree(menus, m.id);
        if (children.length) node.children = children;
        return node;
      });
  }

  // ---------- User manage ----------

  async listUsers(params: {
    keyword?: string;
    status?: string;
    roleId?: string | number;
    curPage?: string | number;
    pageSize?: string | number;
  }) {
    const curPage = Math.max(1, Number(params.curPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (params.keyword) {
      const kw = params.keyword.trim();
      where.OR = [
        { name: { contains: kw } },
        { phone: { contains: kw } },
        { email: { contains: kw } },
        { accountAlias: { contains: kw } },
      ];
    }
    if (params.status) where.status = params.status;
    if (params.roleId) {
      where.userRoles = { some: { roleId: BigInt(params.roleId) } };
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        skip: (curPage - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
        include: {
          userRoles: { include: { role: true } },
        },
      }),
    ]);

    const list = rows.map((u) => {
      const { password: _p, userRoles, ...rest } = u;
      return serializeBigInt({
        ...rest,
        roles: userRoles
          .filter((ur) => ur.role)
          .map((ur) => ({
            id: Number(ur.role.id),
            name: ur.role.name,
            code: ur.role.code,
          })),
        roleIds: userRoles.map((ur) => Number(ur.roleId)),
      });
    });

    return { status: true, msg: "ok", data: { list, total, curPage, pageSize } };
  }

  async getUserDetail(id: number) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: BigInt(id), deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) return { status: false, msg: "用户不存在", data: null };
    const { password: _p, userRoles, ...rest } = user;
    return {
      status: true,
      msg: "ok",
      data: serializeBigInt({
        ...rest,
        roles: userRoles.map((ur) => ({
          id: Number(ur.role.id),
          name: ur.role.name,
          code: ur.role.code,
        })),
        roleIds: userRoles.map((ur) => Number(ur.roleId)),
      }),
    };
  }

  async createUser(body: {
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    accountAlias?: string;
    status?: string;
    level?: number;
    roleIds?: number[];
  }) {
    if (!body.phone && !body.email) {
      return { status: false, msg: "手机号或邮箱至少填一项", data: null };
    }
    if (!body.password) {
      return { status: false, msg: "密码不能为空", data: null };
    }
    const now = Date.now();
    try {
      const created = await this.prisma.client.user.create({
        data: {
          name: body.name || "",
          phone: body.phone || null,
          email: body.email || null,
          password: body.password,
          accountAlias: body.accountAlias || null,
          status: body.status || "active",
          level: body.level ?? 1,
          createTime: BigInt(now),
          updateTime: BigInt(now),
        },
      });
      if (body.roleIds?.length) {
        await this.assignRoles(Number(created.id), body.roleIds);
      }
      return this.getUserDetail(Number(created.id));
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  async updateUser(body: {
    id: number;
    name?: string;
    phone?: string;
    email?: string;
    accountAlias?: string;
    status?: string;
    level?: number;
    roleIds?: number[];
  }) {
    if (!body.id) return { status: false, msg: "缺少用户 id", data: null };
    const now = Date.now();
    try {
      await this.prisma.client.user.update({
        where: { id: BigInt(body.id) },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
          ...(body.email !== undefined ? { email: body.email || null } : {}),
          ...(body.accountAlias !== undefined
            ? { accountAlias: body.accountAlias }
            : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.level !== undefined ? { level: body.level } : {}),
          updateTime: BigInt(now),
        },
      });
      if (body.roleIds !== undefined) {
        await this.assignRoles(body.id, body.roleIds);
      }
      return this.getUserDetail(body.id);
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  async deleteUser(id: number) {
    const now = Date.now();
    await this.prisma.client.user.update({
      where: { id: BigInt(id) },
      data: { deletedAt: BigInt(now), status: "deleted", updateTime: BigInt(now) },
    });
    return { status: true, msg: "删除成功", data: true };
  }

  async resetPassword(userId: number, password: string) {
    if (!password) return { status: false, msg: "密码不能为空", data: null };
    await this.prisma.client.user.update({
      where: { id: BigInt(userId) },
      data: { password, updateTime: BigInt(Date.now()) },
    });
    return { status: true, msg: "重置成功", data: true };
  }

  async assignRoles(userId: number, roleIds: number[]) {
    await this.prisma.client.sysUserRole.deleteMany({
      where: { userId: BigInt(userId) },
    });
    const unique = [...new Set(roleIds.map(Number).filter(Boolean))];
    if (unique.length) {
      await this.prisma.client.sysUserRole.createMany({
        data: unique.map((roleId) => ({
          userId: BigInt(userId),
          roleId: BigInt(roleId),
        })),
        skipDuplicates: true,
      });
    }
    return { status: true, msg: "ok", data: true };
  }

  // ---------- Role ----------

  async listRoles(params: {
    keyword?: string;
    name?: string;
    code?: string;
    status?: string | number;
    beginTime?: string;
    endTime?: string;
    curPage?: string | number;
    pageSize?: string | number;
  }) {
    const curPage = Math.max(1, Number(params.curPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const where: Prisma.SysRoleWhereInput = {};
    if (params.keyword) {
      const kw = params.keyword.trim();
      where.OR = [{ name: { contains: kw } }, { code: { contains: kw } }];
    }
    if (params.name?.trim()) {
      where.name = { contains: params.name.trim() };
    }
    if (params.code?.trim()) {
      where.code = { contains: params.code.trim() };
    }
    if (params.status !== undefined && params.status !== "") {
      where.status = Number(params.status);
    }
    if (params.beginTime || params.endTime) {
      where.createTime = {};
      if (params.beginTime) {
        where.createTime.gte = BigInt(new Date(params.beginTime).getTime());
      }
      if (params.endTime) {
        const end = new Date(params.endTime);
        end.setHours(23, 59, 59, 999);
        where.createTime.lte = BigInt(end.getTime());
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.sysRole.count({ where }),
      this.prisma.client.sysRole.findMany({
        where,
        skip: (curPage - 1) * pageSize,
        take: pageSize,
        orderBy: [{ sort: "asc" }, { id: "asc" }],
      }),
    ]);

    return {
      status: true,
      msg: "ok",
      data: {
        list: serializeBigInt(rows),
        total,
        curPage,
        pageSize,
      },
    };
  }

  async getRoleDetail(id: number) {
    const role = await this.prisma.client.sysRole.findUnique({
      where: { id: BigInt(id) },
    });
    if (!role) return { status: false, msg: "角色不存在", data: null };
    return { status: true, msg: "ok", data: serializeBigInt(role) };
  }

  async createRole(body: {
    name: string;
    code: string;
    remark?: string;
    status?: number;
    sort?: number;
  }) {
    if (!body.name || !body.code) {
      return { status: false, msg: "名称和编码不能为空", data: null };
    }
    const now = Date.now();
    try {
      const row = await this.prisma.client.sysRole.create({
        data: {
          name: body.name,
          code: body.code,
          remark: body.remark || null,
          status: body.status ?? 1,
          sort: body.sort ?? 0,
          createTime: BigInt(now),
          updateTime: BigInt(now),
        },
      });
      return { status: true, msg: "创建成功", data: serializeBigInt(row) };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  async updateRole(body: {
    id: number;
    name?: string;
    code?: string;
    remark?: string;
    status?: number;
    sort?: number;
  }) {
    if (!body.id) return { status: false, msg: "缺少角色 id", data: null };
    try {
      const row = await this.prisma.client.sysRole.update({
        where: { id: BigInt(body.id) },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.remark !== undefined ? { remark: body.remark } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.sort !== undefined ? { sort: body.sort } : {}),
          updateTime: BigInt(Date.now()),
        },
      });
      return { status: true, msg: "更新成功", data: serializeBigInt(row) };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  async deleteRole(id: number) {
    const role = await this.prisma.client.sysRole.findUnique({
      where: { id: BigInt(id) },
    });
    if (!role) return { status: false, msg: "角色不存在", data: null };
    if (role.code === "super_admin") {
      return { status: false, msg: "不能删除超级管理员角色", data: null };
    }
    await this.prisma.client.sysRoleMenu.deleteMany({
      where: { roleId: BigInt(id) },
    });
    await this.prisma.client.sysUserRole.deleteMany({
      where: { roleId: BigInt(id) },
    });
    await this.prisma.client.sysRole.delete({ where: { id: BigInt(id) } });
    return { status: true, msg: "删除成功", data: true };
  }

  async getRoleMenuIds(roleId: number) {
    const role = await this.prisma.client.sysRole.findUnique({
      where: { id: BigInt(roleId) },
    });
    if (!role) {
      return { status: false, msg: "角色不存在", data: [] };
    }

    // 超级管理员默认拥有全部菜单
    if (role.code === "super_admin") {
      await this.ensureSuperAdminOwnsAllMenus();
      const all = await this.prisma.client.sysMenu.findMany({
        select: { id: true },
      });
      return {
        status: true,
        msg: "ok",
        data: all.map((m) => Number(m.id)),
      };
    }

    const rows = await this.prisma.client.sysRoleMenu.findMany({
      where: { roleId: BigInt(roleId) },
    });
    return {
      status: true,
      msg: "ok",
      data: rows.map((r) => Number(r.menuId)),
    };
  }

  async bindMenus(roleId: number, menuIds: number[]) {
    const role = await this.prisma.client.sysRole.findUnique({
      where: { id: BigInt(roleId) },
    });
    if (!role) return { status: false, msg: "角色不存在", data: null };

    // 超级管理员始终绑定全部菜单，忽略传入勾选
    if (role.code === "super_admin") {
      await this.ensureSuperAdminOwnsAllMenus();
      return {
        status: true,
        msg: "超级管理员默认拥有全部菜单权限",
        data: true,
      };
    }

    await this.prisma.client.sysRoleMenu.deleteMany({
      where: { roleId: BigInt(roleId) },
    });
    const unique = [...new Set(menuIds.map(Number).filter(Boolean))];
    if (unique.length) {
      await this.prisma.client.sysRoleMenu.createMany({
        data: unique.map((menuId) => ({
          roleId: BigInt(roleId),
          menuId: BigInt(menuId),
        })),
        skipDuplicates: true,
      });
    }
    return { status: true, msg: "绑定成功", data: true };
  }

  /** 将全部菜单同步绑定到超级管理员角色 */
  async ensureSuperAdminOwnsAllMenus(extraMenuId?: bigint | number) {
    const superRoles = await this.prisma.client.sysRole.findMany({
      where: { code: "super_admin", status: 1 },
      select: { id: true },
    });
    if (!superRoles.length) return;

    const menus = await this.prisma.client.sysMenu.findMany({
      select: { id: true },
    });
    const menuIds = new Set(menus.map((m) => m.id));
    if (extraMenuId != null) menuIds.add(BigInt(extraMenuId));

    for (const role of superRoles) {
      const existing = await this.prisma.client.sysRoleMenu.findMany({
        where: { roleId: role.id },
        select: { menuId: true },
      });
      const have = new Set(existing.map((e) => e.menuId));
      const missing = [...menuIds].filter((id) => !have.has(id));
      if (missing.length) {
        await this.prisma.client.sysRoleMenu.createMany({
          data: missing.map((menuId) => ({
            roleId: role.id,
            menuId,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  // ---------- Menu ----------

  async getMenuTree(all = true) {
    const where = all ? {} : { status: 1 };
    const rows = await this.prisma.client.sysMenu.findMany({
      where,
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    });
    return {
      status: true,
      msg: "ok",
      data: this.buildMenuTree(rows),
    };
  }

  async getMenuDetail(id: number) {
    const row = await this.prisma.client.sysMenu.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) return { status: false, msg: "菜单不存在", data: null };
    return { status: true, msg: "ok", data: serializeBigInt(row) };
  }

  async createMenu(body: {
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
  }) {
    if (!body.name || body.type === undefined) {
      return { status: false, msg: "名称和类型不能为空", data: null };
    }
    const now = Date.now();
    const row = await this.prisma.client.sysMenu.create({
      data: {
        parentId: BigInt(body.parentId ?? 0),
        name: body.name,
        type: Number(body.type),
        path: body.path || null,
        component: body.component || null,
        permission: body.permission || null,
        icon: body.icon || null,
        sort: body.sort ?? 0,
        visible: body.visible ?? 1,
        status: body.status ?? 1,
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
    });
    // 新建菜单自动授予超级管理员
    await this.ensureSuperAdminOwnsAllMenus(row.id);
    return { status: true, msg: "创建成功", data: serializeBigInt(row) };
  }

  async updateMenu(body: {
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
  }) {
    if (!body.id) return { status: false, msg: "缺少菜单 id", data: null };
    const row = await this.prisma.client.sysMenu.update({
      where: { id: BigInt(body.id) },
      data: {
        ...(body.parentId !== undefined
          ? { parentId: BigInt(body.parentId) }
          : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: Number(body.type) } : {}),
        ...(body.path !== undefined ? { path: body.path || null } : {}),
        ...(body.component !== undefined
          ? { component: body.component || null }
          : {}),
        ...(body.permission !== undefined
          ? { permission: body.permission || null }
          : {}),
        ...(body.icon !== undefined ? { icon: body.icon || null } : {}),
        ...(body.sort !== undefined ? { sort: body.sort } : {}),
        ...(body.visible !== undefined ? { visible: body.visible } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updateTime: BigInt(Date.now()),
      },
    });
    return { status: true, msg: "更新成功", data: serializeBigInt(row) };
  }

  async deleteMenu(id: number) {
    const child = await this.prisma.client.sysMenu.findFirst({
      where: { parentId: BigInt(id) },
    });
    if (child) {
      return { status: false, msg: "请先删除子菜单", data: null };
    }
    await this.prisma.client.sysRoleMenu.deleteMany({
      where: { menuId: BigInt(id) },
    });
    await this.prisma.client.sysMenu.delete({ where: { id: BigInt(id) } });
    return { status: true, msg: "删除成功", data: true };
  }

  async getUserMenus(userId: number) {
    const menuIds = await this.getUserMenuIds(userId);
    if (!menuIds.length) {
      return { status: true, msg: "ok", data: [] };
    }
    const rows = await this.prisma.client.sysMenu.findMany({
      where: {
        id: { in: menuIds },
        status: 1,
        visible: 1,
        type: { in: [1, 2] },
      },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    });
    // Ensure parent directories exist in tree even if not explicitly bound
    const idSet = new Set(rows.map((r) => r.id));
    const extra: typeof rows = [];
    for (const row of rows) {
      let pid = row.parentId;
      while (pid !== BigInt(0) && !idSet.has(pid)) {
        const parent = await this.prisma.client.sysMenu.findUnique({
          where: { id: pid },
        });
        if (!parent || parent.status !== 1) break;
        extra.push(parent);
        idSet.add(parent.id);
        pid = parent.parentId;
      }
    }
    const all = [...rows, ...extra];
    const uniq = new Map(all.map((m) => [Number(m.id), m]));
    return {
      status: true,
      msg: "ok",
      data: this.buildMenuTree([...uniq.values()]),
    };
  }

  async getUserPermissions(userId: number) {
    const { roleCodes, permissions } =
      await this.getUserRoleAndPermissions(userId);
    if (roleCodes.includes("super_admin")) {
      const all = await this.prisma.client.sysMenu.findMany({
        where: { status: 1, permission: { not: null } },
        select: { permission: true },
      });
      const codes = [
        ...new Set(
          all.map((m) => m.permission).filter((p): p is string => !!p),
        ),
      ];
      return {
        status: true,
        msg: "ok",
        data: { roles: roleCodes, permissions: codes },
      };
    }
    return {
      status: true,
      msg: "ok",
      data: { roles: roleCodes, permissions },
    };
  }
}
