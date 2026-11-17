/* eslint-disable no-console */
/**
 * 诊断：拉取最近 N 场星聚局的落库状态（含玩家/轮次留痕），
 * 复现「开始后其他成员没进对局」问题用。
 * 运行：node scripts/party-recent-sessions.js [days] [dbUrl]
 */
const { PrismaClient } = require('@prisma/client')

const days = Number(process.argv[2] || 7)
const url = process.argv[3]
if (url) process.env.DATABASE_URL = url

const prisma = new PrismaClient()

function ts(d) {
  if (!d) return '-'
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function main() {
  const since = new Date(Date.now() - days * 864e5)
  const sessions = await prisma.partySession.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { players: true, roundRecords: true },
  })
  console.log(`最近 ${days} 天内 session 数：${sessions.length}`)
  for (const s of sessions) {
    console.log('---')
    console.log(
      `${s.id.slice(0, 8)}… code=${s.code} game=${s.gameType} status=${s.status} rounds=${s.rounds} players=${s.players.length}`,
    )
    console.log(
      `  created=${ts(s.createdAt)} started=${ts(s.startedAt)} closed=${ts(s.closedAt)} updated=${ts(s.updatedAt)}`,
    )
    for (const p of s.players) {
      console.log(
        `  · ${p.name} host=${p.isHost} ready=${p.ready} online=${p.online} absent=${p.absent} key=${p.clientKey.slice(0, 12)}… joined=${ts(p.createdAt)} updated=${ts(p.updatedAt)}`,
      )
    }
    for (const r of s.roundRecords) {
      console.log(`  round no=${r.roundNo} data=${JSON.stringify(r.data).slice(0, 140)}`)
    }
  }
}

main()
  .catch(e => {
    console.error('查询失败:', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
