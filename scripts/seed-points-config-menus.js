/**
 * 为积分规则/等级配置补充菜单入口
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8011";
const USER_ID = process.env.SEED_USER_ID || "1";

async function req(method, path, body) {
  const url = new URL(path, BASE);
  url.searchParams.set("userId", USER_ID);
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function flatten(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n);
    if (n.children?.length) flatten(n.children, acc);
  }
  return acc;
}

async function ensure(def, index) {
  const hit =
    (def.path && index.get(`path:${def.path}`)) ||
    index.get(`name:${def.parentId}:${def.name}:${def.type}`);
  if (hit) {
    console.log("skip", def.name, hit.id);
    return hit;
  }
  const created = await req("POST", "/api/menuApi/create", def);
  if (!created.status) throw new Error(created.msg || "create failed");
  console.log("created", def.name, created.data.id);
  const row = created.data;
  if (row.path) index.set(`path:${row.path}`, row);
  index.set(`name:${row.parentId}:${row.name}:${row.type}`, row);
  return row;
}

async function main() {
  const tree = await req("GET", "/api/menuApi/tree");
  const flat = flatten(tree.data || []);
  const index = new Map();
  for (const m of flat) {
    if (m.path) index.set(`path:${m.path}`, m);
    index.set(`name:${m.parentId}:${m.name}:${m.type}`, m);
  }

  const parent = flat.find((m) => m.path === "/home/manageHomePage/points");
  if (!parent) throw new Error("未找到积分管理菜单，请先执行 seed:points-menus");

  const rules = await ensure(
    {
      parentId: Number(parent.id),
      name: "规则配置",
      type: 2,
      path: "/home/manageHomePage/points/rules",
      permission: "system:points:list",
      sort: 2,
      visible: 1,
      status: 1,
    },
    index,
  );
  const levels = await ensure(
    {
      parentId: Number(parent.id),
      name: "等级配置",
      type: 2,
      path: "/home/manageHomePage/points/levels",
      permission: "system:points:list",
      sort: 3,
      visible: 1,
      status: 1,
    },
    index,
  );

  // overview optional menu
  await ensure(
    {
      parentId: Number(parent.id),
      name: "积分概览",
      type: 2,
      path: "/home/manageHomePage/points/overview",
      permission: "system:points:list",
      sort: 1,
      visible: 1,
      status: 1,
    },
    index,
  );

  const roles = (await req("GET", "/api/roleApi/list?pageSize=50")).data?.list || [];
  const newIds = [Number(rules.id), Number(levels.id)];
  const allTree = flatten((await req("GET", "/api/menuApi/tree")).data || []).map(
    (m) => Number(m.id),
  );

  for (const role of roles) {
    const roleId = Number(role.id);
    if (role.code === "super_admin") {
      await req("POST", "/api/roleApi/bindMenus", {
        roleId,
        menuIds: allTree,
      });
      console.log("bind super_admin all", allTree.length);
      continue;
    }
    const cur = await req("GET", `/api/roleApi/menuIds/${roleId}`);
    const current = (cur.data || []).map(Number);
    let extra = [];
    if (role.code === "admin" || role.code === "advanced") {
      extra = newIds;
    }
    if (!extra.length) continue;
    const menuIds = [...new Set([...current, ...extra, Number(parent.id)])];
    await req("POST", "/api/roleApi/bindMenus", { roleId, menuIds });
    console.log("bind", role.code, menuIds.length);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
