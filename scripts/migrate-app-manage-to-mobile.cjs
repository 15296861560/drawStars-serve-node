/**
 * Migrate published app_manage rows → mobile_module + mobile_module_version.
 * Usage: node scripts/migrate-app-manage-to-mobile.cjs
 * Requires DATABASE_URL / prisma client.
 */
/* eslint-disable */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function moduleCodeOf(row) {
  if (row.moduleCode) return row.moduleCode
  return (
    'app.' +
    String(row.name || 'mod')
      .replace(/\s+/g, '_')
      .toLowerCase()
  )
}

async function main() {
  const rows = await prisma.appManage.findMany({
    where: { status: 'published' },
  })
  console.log('[migrate] published apps:', rows.length)
  const now = Date.now()
  let n = 0
  for (const app of rows) {
    const moduleCode = moduleCodeOf(app)
    await prisma.mobileModule.upsert({
      where: { moduleCode },
      create: {
        moduleCode,
        name: app.name,
        description: app.description,
        icon: app.icon,
        category: app.category,
        platforms: app.platforms || 'h5',
        status: 'published',
        latestVersion: app.version || '1.0.0',
        moduleUrl: app.moduleUrl,
        appManageId: app.id,
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
      update: {
        name: app.name,
        description: app.description,
        icon: app.icon,
        category: app.category,
        platforms: app.platforms || 'h5',
        status: 'published',
        latestVersion: app.version || '1.0.0',
        moduleUrl: app.moduleUrl,
        appManageId: app.id,
        updateTime: BigInt(now),
      },
    })
    const version = app.version || '1.0.0'
    await prisma.mobileModuleVersion.upsert({
      where: {
        moduleCode_version: { moduleCode, version },
      },
      create: {
        moduleCode,
        version,
        platforms: app.platforms || 'h5',
        moduleUrl: app.moduleUrl,
        filePath: app.filePath,
        checksum: app.checksum,
        releaseNotes: app.releaseNotes,
        forceUpdate: app.forceUpdate || 0,
        status: 'published',
        createTime: BigInt(now),
      },
      update: {
        platforms: app.platforms || 'h5',
        moduleUrl: app.moduleUrl,
        filePath: app.filePath,
        checksum: app.checksum,
        releaseNotes: app.releaseNotes,
        forceUpdate: app.forceUpdate || 0,
        status: 'published',
      },
    })
    if (!app.moduleCode) {
      await prisma.appManage.update({
        where: { id: app.id },
        data: { moduleCode },
      })
    }
    n++
  }
  console.log('[migrate] done', n)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
