/* eslint-disable no-console */
/**
 * 诊断：按时间窗拉取 sys Log（窗口下推：createTime gte/lte）重建操作痕迹。
 * 运行：node scripts/party-timeline.js "2026-11-17 19:15:00" "2026-11-17 19:40:00"
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function ts(d) {
  if (!d) return '-'
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function local(s) {
  return new Date(s.replace(' ', 'T'))
}

async function main() {
  const from = local(process.argv[2] || '2026-11-17 00:00:00')
  const to = local(process.argv[3] || '2026-11-17 23:59:59')

  for (const [scale, unit] of [['ms', 1], ['s', 1000]]) {
    const gte = Number(from.getTime()) / (scale === 'ms' ? 1 : 1000)
    const lte = Number(to.getTime()) / (scale === 'ms' ? 1 : 1000)
    const logs = await prisma.log.findMany({
      where: { createTime: { gte, lte } },
      orderBy: { createTime: 'asc' },
      take: 800,
    })
    console.log(`\n== Log 窗口条数 (${scale}): ${logs.length}`)
    for (const l of logs) {
      const n = Number(l.createTime)
      const t = scale === 'ms' ? new Date(n) : new Date(n * 1000)
      console.log(
        `${ts(t)} [${l.logType}] ${l.method || ''} ${l.originalUrl || ''} ip=${l.ip || ''} ua=${String(l.userAgent || '').slice(0, 60)}`,
      )
    }
    if (logs.length) break
  }

  const stars = await prisma.partyStarTrans.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, take: 200 })
  console.log(`\nPartyStarTrans 条数: ${stars.length}`)
  for (const s of stars) {
    console.log(`${ts(s.createdAt)} ${String(s.ownerKey).slice(0, 14)}… op=${s.operation} val=${s.value} ses=${String(s.sessionId).slice(0, 8)} meta=${JSON.stringify(s.meta).slice(0, 120)}`)
  }

  const rounds = await prisma.partyRound.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, take: 200 })
  console.log(`\nPartyRound 条数: ${rounds.length}`)
  for (const r of rounds) {
    console.log(`${ts(r.createdAt)} ses=${String(r.sessionId).slice(0, 8)} no=${r.roundNo} data=${JSON.stringify(r.data).slice(0, 160)}`)
  }

  const cards = await prisma.partyCard.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, take: 300 })
  console.log(`\nPartyCard 条数: ${cards.length}`)
  for (const c of cards) {
    console.log(`${ts(c.createdAt)} ses=${String(c.sessionId).slice(0, 8)} kind=${c.kind} player=${String(c.clientKey || '').slice(0, 12)} used=${c.used} q=${String(c.content || '').slice(0, 50)}`)
  }

  const reports = await prisma.partyReport.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, take: 100 })
  console.log(`\nPartyReport 条数: ${reports.length}`)
  for (const r of reports) {
    console.log(`${ts(r.createdAt)} ses=${String(r.sessionId).slice(0, 8)} data=${JSON.stringify(r.data).slice(0, 220)}`)
  }
}

main()
  .catch(e => {
    console.error('查询失败:', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
