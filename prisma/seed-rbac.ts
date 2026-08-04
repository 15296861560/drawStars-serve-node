/**
 * Idempotent RBAC seed: roles, menus, role-menu binds, user-role by level.
 * Run: pnpm prisma:seed-rbac
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEVEL_TO_ROLE: Record<number, string> = {
  1: "user",
  2: "advanced",
  9: "admin",
  99: "super_admin",
};

type MenuSeed = {
  key: string;
  parentKey?: string;
  name: string;
  type: 1 | 2 | 3;
  path?: string;
  permission?: string;
  icon?: string;
  sort: number;
};

const MENU_SEEDS: MenuSeed[] = [
  { key: "home", name: "首页", type: 2, path: "/home/homepage", icon: "HomeFilled", sort: 1 },
  { key: "manage", name: "管理中心", type: 1, path: "/home/manageHomePage", icon: "Setting", sort: 10 },
  {
    key: "manage_user",
    parentKey: "manage",
    name: "用户管理",
    type: 2,
    path: "/home/manageHomePage/user",
    permission: "system:user:list",
    sort: 1,
  },
  { key: "manage_user_create", parentKey: "manage_user", name: "新增用户", type: 3, permission: "system:user:create", sort: 1 },
  { key: "manage_user_update", parentKey: "manage_user", name: "编辑用户", type: 3, permission: "system:user:update", sort: 2 },
  { key: "manage_user_delete", parentKey: "manage_user", name: "删除用户", type: 3, permission: "system:user:delete", sort: 3 },
  { key: "manage_user_assign", parentKey: "manage_user", name: "分配角色", type: 3, permission: "system:user:assign", sort: 4 },
  {
    key: "manage_role",
    parentKey: "manage",
    name: "角色管理",
    type: 2,
    path: "/home/manageHomePage/role",
    permission: "system:role:list",
    sort: 2,
  },
  { key: "manage_role_create", parentKey: "manage_role", name: "新增角色", type: 3, permission: "system:role:create", sort: 1 },
  { key: "manage_role_update", parentKey: "manage_role", name: "编辑角色", type: 3, permission: "system:role:update", sort: 2 },
  { key: "manage_role_delete", parentKey: "manage_role", name: "删除角色", type: 3, permission: "system:role:delete", sort: 3 },
  { key: "manage_role_bind", parentKey: "manage_role", name: "绑定菜单", type: 3, permission: "system:role:bind", sort: 4 },
  {
    key: "manage_menu",
    parentKey: "manage",
    name: "菜单配置",
    type: 2,
    path: "/home/manageHomePage/menu",
    permission: "system:menu:list",
    sort: 3,
  },
  { key: "manage_menu_create", parentKey: "manage_menu", name: "新增菜单", type: 3, permission: "system:menu:create", sort: 1 },
  { key: "manage_menu_update", parentKey: "manage_menu", name: "编辑菜单", type: 3, permission: "system:menu:update", sort: 2 },
  { key: "manage_menu_delete", parentKey: "manage_menu", name: "删除菜单", type: 3, permission: "system:menu:delete", sort: 3 },
  {
    key: "manage_notice",
    parentKey: "manage",
    name: "通知管理",
    type: 2,
    path: "/home/manageHomePage/notice",
    sort: 4,
  },
  {
    key: "manage_app",
    parentKey: "manage",
    name: "应用管理",
    type: 2,
    path: "/home/manageHomePage/app",
    sort: 5,
  },
  {
    key: "manage_logs",
    parentKey: "manage",
    name: "日志管理",
    type: 2,
    path: "/home/manageHomePage/logs",
    sort: 6,
  },
  { key: "profile", name: "个人中心", type: 2, path: "/home/personalCenter/basicInfo", icon: "User", sort: 20 },
];

const ROLE_SEEDS = [
  { name: "普通用户", code: "user", remark: "基础访问", sort: 1, menuKeys: ["home", "profile"] },
  {
    name: "进阶用户",
    code: "advanced",
    remark: "进阶功能",
    sort: 2,
    menuKeys: ["home", "profile", "manage", "manage_notice", "manage_app"],
  },
  {
    name: "管理员",
    code: "admin",
    remark: "系统管理",
    sort: 3,
    menuKeys: [
      "home",
      "profile",
      "manage",
      "manage_user",
      "manage_user_create",
      "manage_user_update",
      "manage_user_delete",
      "manage_user_assign",
      "manage_role",
      "manage_role_create",
      "manage_role_update",
      "manage_role_delete",
      "manage_role_bind",
      "manage_notice",
      "manage_app",
      "manage_logs",
    ],
  },
  {
    name: "超级管理员",
    code: "super_admin",
    remark: "全部权限",
    sort: 4,
    menuKeys: "ALL" as const,
  },
];

async function upsertRoles() {
  const now = Date.now();
  const map = new Map<string, bigint>();
  for (const role of ROLE_SEEDS) {
    const row = await prisma.sysRole.upsert({
      where: { code: role.code },
      create: {
        name: role.name,
        code: role.code,
        remark: role.remark,
        status: 1,
        sort: role.sort,
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
      update: {
        name: role.name,
        remark: role.remark,
        status: 1,
        sort: role.sort,
        updateTime: BigInt(now),
      },
    });
    map.set(role.code, row.id);
  }
  return map;
}

async function upsertMenus() {
  const now = Date.now();
  const keyToId = new Map<string, bigint>();

  // Create parents first by iterating in declaration order
  for (const m of MENU_SEEDS) {
    const parentId = m.parentKey ? keyToId.get(m.parentKey) ?? BigInt(0) : BigInt(0);
    const existing = await prisma.sysMenu.findFirst({
      where: {
        name: m.name,
        parentId,
        type: m.type,
        ...(m.path ? { path: m.path } : {}),
        ...(m.permission ? { permission: m.permission } : {}),
      },
    });

    let row;
    if (existing) {
      row = await prisma.sysMenu.update({
        where: { id: existing.id },
        data: {
          parentId,
          name: m.name,
          type: m.type,
          path: m.path ?? null,
          permission: m.permission ?? null,
          icon: m.icon ?? null,
          sort: m.sort,
          visible: 1,
          status: 1,
          updateTime: BigInt(now),
        },
      });
    } else {
      row = await prisma.sysMenu.create({
        data: {
          parentId,
          name: m.name,
          type: m.type,
          path: m.path ?? null,
          permission: m.permission ?? null,
          icon: m.icon ?? null,
          sort: m.sort,
          visible: 1,
          status: 1,
          createTime: BigInt(now),
          updateTime: BigInt(now),
        },
      });
    }
    keyToId.set(m.key, row.id);
  }
  return keyToId;
}

async function bindRoleMenus(
  roleMap: Map<string, bigint>,
  menuMap: Map<string, bigint>,
) {
  const allMenuIds = [...menuMap.values()];
  for (const role of ROLE_SEEDS) {
    const roleId = roleMap.get(role.code);
    if (!roleId) continue;
    const menuIds =
      role.menuKeys === "ALL"
        ? allMenuIds
        : role.menuKeys
            .map((k) => menuMap.get(k))
            .filter((id): id is bigint => id !== undefined);

    await prisma.sysRoleMenu.deleteMany({ where: { roleId } });
    if (menuIds.length) {
      await prisma.sysRoleMenu.createMany({
        data: menuIds.map((menuId) => ({ roleId, menuId })),
        skipDuplicates: true,
      });
    }
  }
}

async function bindUsersByLevel(roleMap: Map<string, bigint>) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, level: true },
  });
  for (const user of users) {
    const code = LEVEL_TO_ROLE[user.level ?? 1] || "user";
    const roleId = roleMap.get(code);
    if (!roleId) continue;
    const existing = await prisma.sysUserRole.findFirst({
      where: { userId: user.id },
    });
    if (existing) continue;
    await prisma.sysUserRole.create({
      data: { userId: user.id, roleId },
    });
  }
}

async function main() {
  console.log("[seed-rbac] start");
  const roleMap = await upsertRoles();
  const menuMap = await upsertMenus();
  await bindRoleMenus(roleMap, menuMap);
  await bindUsersByLevel(roleMap);
  console.log("[seed-rbac] done", {
    roles: roleMap.size,
    menus: menuMap.size,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
