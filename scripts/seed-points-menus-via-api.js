/**
 * 通过 menuApi / roleApi 新增积分相关菜单并绑定角色
 * 用法: node scripts/seed-points-menus-via-api.js
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
const USER_ID = process.env.SEED_USER_ID || "1";

async function req(method, path, body) {
  const url = new URL(path, BASE);
  if (!url.searchParams.has("userId")) {
    url.searchParams.set("userId", USER_ID);
  }
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} => ${res.status} ${text}`);
  }
  return data;
}

function flattenMenus(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n);
    if (n.children?.length) flattenMenus(n.children, acc);
  }
  return acc;
}

async function ensureMenu(def, index) {
  const byPath = def.path ? index.get(`path:${def.path}`) : null;
  const byName = index.get(`name:${def.parentId}:${def.name}:${def.type}`);
  const hit = byPath || byName;
  if (hit) {
    console.log(`skip exists: ${def.name} (#${hit.id})`);
    return hit;
  }
  const created = await req("POST", "/api/menuApi/create", def);
  if (!created.status) {
    throw new Error(`create failed: ${def.name} ${created.msg || ""}`);
  }
  console.log(`created: ${def.name} (#${created.data.id})`);
  const row = created.data;
  if (row.path) index.set(`path:${row.path}`, row);
  index.set(`name:${row.parentId}:${row.name}:${row.type}`, row);
  return row;
}

async function mergeBind(roleId, code, extraIds) {
  const cur = await req("GET", `/api/roleApi/menuIds/${roleId}`);
  const current = (cur.data || []).map(Number);
  const menuIds = [...new Set([...current, ...extraIds.map(Number)])];
  const r = await req("POST", "/api/roleApi/bindMenus", { roleId, menuIds });
  console.log(
    `bind ${code}(#${roleId}):`,
    r.status,
    r.msg,
    `${current.length} -> ${menuIds.length}`,
  );
}

async function main() {
  console.log("API", BASE, "userId", USER_ID);

  const treeRes = await req("GET", "/api/menuApi/tree");
  if (!treeRes.status) throw new Error(`tree failed: ${treeRes.msg}`);

  const flat = flattenMenus(treeRes.data || []);
  const index = new Map();
  for (const m of flat) {
    if (m.path) index.set(`path:${m.path}`, m);
    index.set(`name:${m.parentId}:${m.name}:${m.type}`, m);
  }

  const manage = flat.find(
    (m) => m.path === "/home/manageHomePage" && Number(m.type) === 1,
  );
  const profile = flat.find((m) => m.path === "/home/personalCenter/basicInfo");
  if (!manage) throw new Error("未找到管理中心目录菜单");
  if (!profile) throw new Error("未找到个人中心菜单");

  const managePoints = await ensureMenu(
    {
      parentId: Number(manage.id),
      name: "积分管理",
      type: 2,
      path: "/home/manageHomePage/points",
      permission: "system:points:list",
      icon: "Coin",
      sort: 4,
      visible: 1,
      status: 1,
    },
    index,
  );

  const btnView = await ensureMenu(
    {
      parentId: Number(managePoints.id),
      name: "查看积分",
      type: 3,
      permission: "system:points:list",
      sort: 1,
      visible: 1,
      status: 1,
    },
    index,
  );

  const btnOperate = await ensureMenu(
    {
      parentId: Number(managePoints.id),
      name: "积分操作",
      type: 3,
      permission: "system:points:operate",
      sort: 2,
      visible: 1,
      status: 1,
    },
    index,
  );

  const profilePoints = await ensureMenu(
    {
      parentId: Number(profile.id),
      name: "我的积分",
      type: 2,
      path: "/home/personalCenter/points",
      permission: "system:points:self",
      icon: "Coin",
      sort: 1,
      visible: 1,
      status: 1,
    },
    index,
  );

  const ids = {
    manage: Number(manage.id),
    managePoints: Number(managePoints.id),
    btnView: Number(btnView.id),
    btnOperate: Number(btnOperate.id),
    profile: Number(profile.id),
    profilePoints: Number(profilePoints.id),
  };

  const rolesRes = await req("GET", "/api/roleApi/list?pageSize=50&curPage=1");
  const roles = rolesRes.data?.list || rolesRes.data?.records || [];
  console.log(
    "roles",
    roles.map((r) => `${r.code}#${r.id}`).join(", "),
  );

  const treeAll = flattenMenus(
    (await req("GET", "/api/menuApi/tree")).data || [],
  ).map((m) => Number(m.id));

  for (const role of roles) {
    const code = role.code;
    const roleId = Number(role.id);
    if (code === "super_admin") {
      await mergeBind(roleId, code, treeAll);
    } else if (code === "admin") {
      await mergeBind(roleId, code, [
        ids.managePoints,
        ids.btnView,
        ids.btnOperate,
        ids.profilePoints,
      ]);
    } else if (code === "advanced") {
      await mergeBind(roleId, code, [
        ids.manage,
        ids.managePoints,
        ids.btnView,
        ids.profile,
        ids.profilePoints,
      ]);
    } else if (code === "user") {
      await mergeBind(roleId, code, [ids.profile, ids.profilePoints]);
    }
  }

  console.log("done", ids);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
