/**
 * Seed task management menus via menuApi / roleApi
 * Structure: 任务管理(dir) → 任务概览/任务列表/任务审核/奖励发放 (pages) + buttons
 * Usage: API_BASE=http://127.0.0.1:8011 node scripts/seed-task-menus-via-api.js
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8011";
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

async function ensureMenu(def, index, flat) {
  let hit =
    (def.path && index.get(`path:${def.path}`)) ||
    index.get(`name:${def.parentId}:${def.name}:${def.type}`);
  if (!hit && flat) {
    hit = flat.find(
      (m) =>
        Number(m.parentId) === Number(def.parentId) &&
        m.name === def.name &&
        (def.type === 3
          ? Number(m.type) === 3
          : Number(m.type) === 1 || Number(m.type) === 2),
    );
  }
  if (hit) {
    await req("PUT", "/api/menuApi/update", {
      id: Number(hit.id),
      parentId: Number(def.parentId),
      name: def.name,
      type: def.type,
      path: def.path || "",
      permission: def.permission || "",
      icon: def.icon || "",
      sort: def.sort ?? 0,
      visible: def.visible ?? 1,
      status: def.status ?? 1,
    });
    console.log(`upserted: ${def.name} (#${hit.id})`);
    return { ...hit, ...def, id: hit.id };
  }
  const created = await req("POST", "/api/menuApi/create", def);
  if (!created.status) {
    throw new Error(`create failed: ${def.name} ${created.msg || ""}`);
  }
  console.log(`created: ${def.name} (#${created.data.id})`);
  return created.data;
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
  if (!manage) throw new Error("manage menu not found");

  const manageTask = await ensureMenu(
    {
      parentId: Number(manage.id),
      name: "任务管理",
      type: 1,
      path: "",
      permission: "system:task:list",
      icon: "List",
      sort: 5,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );
  const parentId = Number(manageTask.id);

  const pages = [
    {
      name: "任务概览",
      path: "/home/manageHomePage/task/overview",
      permission: "system:task:list",
      icon: "DataAnalysis",
      sort: 1,
    },
    {
      name: "任务列表",
      path: "/home/manageHomePage/task/list",
      permission: "system:task:list",
      icon: "Document",
      sort: 2,
    },
    {
      name: "任务审核",
      path: "/home/manageHomePage/task/audit",
      permission: "system:task:audit",
      icon: "Checked",
      sort: 3,
    },
    {
      name: "奖励发放",
      path: "/home/manageHomePage/task/shipping",
      permission: "system:task:operate",
      icon: "Van",
      sort: 4,
    },
    {
      name: "分类管理",
      path: "/home/manageHomePage/task/categories",
      permission: "system:task:operate",
      icon: "Folder",
      sort: 5,
    },
    {
      name: "奖励模板",
      path: "/home/manageHomePage/task/templates",
      permission: "system:task:operate",
      icon: "Collection",
      sort: 6,
    },
  ];

  const pageIds = [];
  for (const p of pages) {
    const row = await ensureMenu(
      {
        parentId,
        name: p.name,
        type: 2,
        path: p.path,
        permission: p.permission,
        icon: p.icon,
        sort: p.sort,
        visible: 1,
        status: 1,
      },
      index,
      flat,
    );
    pageIds.push(Number(row.id));
  }

  const buttons = [
    { name: "查看任务", permission: "system:task:list", sort: 11 },
    { name: "创建任务", permission: "system:task:create", sort: 12 },
    { name: "编辑任务", permission: "system:task:update", sort: 13 },
    { name: "状态变更", permission: "system:task:status", sort: 14 },
    { name: "领取任务", permission: "system:task:claim", sort: 15 },
    { name: "指派任务", permission: "system:task:assign", sort: 16 },
    { name: "删除任务", permission: "system:task:delete", sort: 17 },
    { name: "任务审核", permission: "system:task:audit", sort: 18 },
    { name: "任务操作", permission: "system:task:operate", sort: 19 },
  ];
  const btnIds = [];
  for (const b of buttons) {
    const row = await ensureMenu(
      {
        parentId,
        name: b.name,
        type: 3,
        permission: b.permission,
        sort: b.sort,
        visible: 1,
        status: 1,
      },
      index,
      flat,
    );
    btnIds.push(Number(row.id));
  }

  const ids = [parentId, ...pageIds, ...btnIds];
  const rolesRes = await req("GET", "/api/roleApi/list?pageSize=50&curPage=1");
  const roles = rolesRes.data?.list || rolesRes.data?.records || [];
  const treeAll = flattenMenus(
    (await req("GET", "/api/menuApi/tree")).data || [],
  ).map((m) => Number(m.id));

  for (const role of roles) {
    const code = role.code;
    const roleId = Number(role.id);
    if (code === "super_admin") {
      await mergeBind(roleId, code, treeAll);
    } else if (code === "admin") {
      await mergeBind(roleId, code, ids);
    } else if (code === "advanced") {
      await mergeBind(roleId, code, [
        parentId,
        pageIds[0],
        pageIds[1],
        btnIds[0],
      ]);
    }
  }

  console.log("done", { parentId, pageIds, btnIds });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
