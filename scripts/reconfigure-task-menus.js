/**
 * Reconfigure task menus: directory + 4 page children (no tabs)
 * Usage: API_BASE=http://127.0.0.1:8011 node scripts/reconfigure-task-menus.js
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

  // Same name under same parent, any type (for type 2 -> 1 conversion)
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
    const updated = await req("PUT", "/api/menuApi/update", {
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
    if (!updated.status) {
      throw new Error(`update failed: ${def.name} ${updated.msg || ""}`);
    }
    console.log(`upserted: ${def.name} (#${hit.id}) type=${def.type}`);
    const row = { ...hit, ...def, id: hit.id };
    if (row.path) index.set(`path:${row.path}`, row);
    index.set(`name:${row.parentId}:${row.name}:${row.type}`, row);
    return row;
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

  const overview = await ensureMenu(
    {
      parentId,
      name: "任务概览",
      type: 2,
      path: "/home/manageHomePage/task/overview",
      permission: "system:task:list",
      icon: "DataAnalysis",
      sort: 1,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );

  const list = await ensureMenu(
    {
      parentId,
      name: "任务列表",
      type: 2,
      path: "/home/manageHomePage/task/list",
      permission: "system:task:list",
      icon: "Document",
      sort: 2,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );

  const audit = await ensureMenu(
    {
      parentId,
      name: "任务审核",
      type: 2,
      path: "/home/manageHomePage/task/audit",
      permission: "system:task:audit",
      icon: "Checked",
      sort: 3,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );

  const shipping = await ensureMenu(
    {
      parentId,
      name: "奖励发放",
      type: 2,
      path: "/home/manageHomePage/task/shipping",
      permission: "system:task:operate",
      icon: "Van",
      sort: 4,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );

  const btnList = await ensureMenu(
    {
      parentId,
      name: "查看任务",
      type: 3,
      permission: "system:task:list",
      sort: 11,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );
  const btnOperate = await ensureMenu(
    {
      parentId,
      name: "任务操作",
      type: 3,
      permission: "system:task:operate",
      sort: 12,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );
  const btnAudit = await ensureMenu(
    {
      parentId,
      name: "任务审核",
      type: 3,
      permission: "system:task:audit",
      sort: 13,
      visible: 1,
      status: 1,
    },
    index,
    flat,
  );

  // Move old type-3 buttons under parent if they were already there (already handled by ensure)
  void btnList;
  void btnOperate;
  void btnAudit;

  const ids = [
    parentId,
    Number(overview.id),
    Number(list.id),
    Number(audit.id),
    Number(shipping.id),
    Number(btnList.id),
    Number(btnOperate.id),
    Number(btnAudit.id),
  ];

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
        Number(overview.id),
        Number(list.id),
        Number(btnList.id),
      ]);
    }
  }

  console.log("done", {
    parentId,
    overview: Number(overview.id),
    list: Number(list.id),
    audit: Number(audit.id),
    shipping: Number(shipping.id),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
