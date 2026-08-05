/**
 * 补齐侧栏「日志管理」目录及访问分析等子菜单，并绑定到 admin / super_admin
 * 用法: node scripts/seed-logs-analytics-menus.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:8011'
const USER_ID = process.env.SEED_USER_ID || '1'

async function req(method, path, body) {
  const url = new URL(path, BASE)
  url.searchParams.set('userId', USER_ID)
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  if (!res.ok || data.status === false) {
    throw new Error(
      `${method} ${path} => ${res.status} ${data.msg || JSON.stringify(data)}`
    )
  }
  return data
}

function flatten(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n)
    if (n.children?.length) flatten(n.children, acc)
  }
  return acc
}

async function ensure(def, index) {
  const byPath = def.path ? index.get(`path:${def.path}`) : null
  const byName = index.get(`name:${def.parentId}:${def.name}:${def.type}`)
  const hit = byPath || byName
  if (hit) {
    console.log('skip', def.name, hit.id)
    return hit
  }
  const created = await req('POST', '/api/menuApi/create', def)
  console.log('created', def.name, created.data.id)
  const row = created.data
  if (row.path) index.set(`path:${row.path}`, row)
  index.set(`name:${row.parentId}:${row.name}:${row.type}`, row)
  return row
}

const CHILDREN = [
  {
    name: '操作日志',
    path: '/home/logs/operation',
    icon: 'Tickets',
    sort: 1
  },
  {
    name: '业务日志',
    path: '/home/logs/business',
    icon: 'Notebook',
    sort: 2
  },
  {
    name: '接口日志',
    path: '/home/logs/api',
    icon: 'Connection',
    sort: 3
  },
  {
    name: '性能日志',
    path: '/home/logs/performance',
    icon: 'Odometer',
    sort: 4
  },
  {
    name: '访问分析',
    path: '/home/logs/traffic',
    icon: 'DataLine',
    sort: 5
  },
  {
    name: '网站配置',
    path: '/home/logs/website',
    icon: 'Monitor',
    sort: 6
  }
]

async function main() {
  const tree = await req('GET', '/api/menuApi/tree')
  const flat = flatten(tree.data || [])
  const index = new Map()
  for (const m of flat) {
    if (m.path) index.set(`path:${m.path}`, m)
    index.set(`name:${m.parentId}:${m.name}:${m.type}`, m)
  }

  // 顶层目录：与静态侧栏「日志管理」对应（区别于管理中心下的日志管理页）
  const parent = await ensure(
    {
      parentId: 0,
      name: '日志管理',
      type: 1,
      path: '/home/logs',
      permission: null,
      icon: 'Document',
      sort: 15,
      visible: 1,
      status: 1
    },
    index
  )

  const childIds = []
  for (const c of CHILDREN) {
    const row = await ensure(
      {
        parentId: Number(parent.id),
        name: c.name,
        type: 2,
        path: c.path,
        permission: null,
        icon: c.icon,
        sort: c.sort,
        visible: 1,
        status: 1
      },
      index
    )
    childIds.push(Number(row.id))
  }

  const roles =
    (await req('GET', '/api/roleApi/list?pageSize=50')).data?.list || []
  const allIds = flatten(
    (await req('GET', '/api/menuApi/tree')).data || []
  ).map(m => Number(m.id))
  const extraIds = [Number(parent.id), ...childIds]

  for (const role of roles) {
    const roleId = Number(role.id)
    if (role.code === 'super_admin') {
      await req('POST', '/api/roleApi/bindMenus', {
        roleId,
        menuIds: allIds
      })
      console.log('bind super_admin all', allIds.length)
      continue
    }
    if (role.code !== 'admin') continue
    const cur = await req('GET', `/api/roleApi/menuIds/${roleId}`)
    const current = (cur.data || []).map(Number)
    const menuIds = [...new Set([...current, ...extraIds])]
    await req('POST', '/api/roleApi/bindMenus', { roleId, menuIds })
    console.log('bind admin', menuIds.length)
  }

  console.log('done')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
