/* eslint-disable no-console */
/**
 * drawStars-serve-node —— party WS「你画我猜」全链冒烟脚本
 *
 * 前置：npm run dev 已启动（REST 3001 + party WS 8020），数据库可达（.env DATABASE_URL）
 *
 * 用例 A（all-hit 全链）：
 *   建房 draw/rounds=1 → join/ready → 双 WS 连接（XFF 区分身份）→ start
 *   → draw.new_round（词仅 painter 视角可见）→ draw.delta（非 painter 落笔挡回）
 *   → 第三客户端入房 draw.replay（最近 20s ops 切片）→ guess miss 广播 + 重复错词挡回
 *   → painter 自猜挡回 → 命中（guessersLeft=0）→ 1.2s hold → round_summary reason=all
 *   → 3.4s hold → gameover{contributions,mvpId,roundsPlayed}
 *   → PartyRound 落库 / session 转 SETTLING → close 清场（session.close 广播）
 *
 * 用例 B（skip 链）：
 *   建房 → start → 非 host skip 静默挡回 → host skip → round_summary reason=skip
 *   → gameover → PartyRound reason=skip
 *
 * 运行：node scripts/ws-smoke-draw.js
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')
const { PrismaClient } = require('@prisma/client')

/* ---------- .env 装载（Prisma 直连验证落库） ---------- */
;(function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  // 对齐 dev 实际连接（env.ts/buildDatabaseUrl(dev_config) 本机 3306；
  // .env 的 44925 是远程库，与 dev 双库错位会导致落档断言查错库）
  process.env.DATABASE_URL = 'mysql://drawStars:Admin_123@127.0.0.1:3306/draw_stars'
})()

const prisma = new PrismaClient()
const REST = { host: '127.0.0.1', port: 3001 }
const WS_URL = 'ws://127.0.0.1:8020/ws?channel='
const PREFIX = 'party.session.'

/* ---------- 断言与工具 ---------- */
let passed = 0
let failed = 0
const failures = []
function ok(cond, label) {
  if (cond) {
    passed++
    console.log('  ✓ ' + label)
  } else {
    failed++
    failures.push(label)
    console.log('  ✗ ' + label)
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDb(probe, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const hit = await probe()
    if (hit) return hit
    await sleep(400)
  }
  return null
}

function rest(method, p, body, xff) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : ''
    const req = http.request(
      {
        host: REST.host,
        port: REST.port,
        path: p,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': xff,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error('非 JSON 回包 ' + method + ' ' + p + ' → ' + raw.slice(0, 200)))
          }
        })
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

/* ---------- WS 客户端 ---------- */
class Client {
  constructor(label, xff) {
    this.label = label
    this.xff = xff
    this.sessionId = ''
    this.ws = null
    this.events = []
    this.waiters = []
  }

  connect() {
    const channelId = PREFIX + this.sessionId
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL + channelId, { headers: { 'X-Forwarded-For': this.xff } })
      this.ws = ws
      const kill = setTimeout(() => reject(new Error(this.label + ' WS 连接超时')), 5000)
      ws.on('open', () => {
        clearTimeout(kill)
        resolve()
      })
      ws.on('error', e => {
        clearTimeout(kill)
        reject(e)
      })
      ws.on('message', raw => {
        let msg
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (!msg || typeof msg.type !== 'string') return
        const evt = { at: Date.now(), type: msg.type, data: msg.data || {} }
        this.events.push(evt)
        this.waiters = this.waiters.filter(w => {
          if (w.type === evt.type && (!w.pred || w.pred(evt.data))) {
            clearTimeout(w.timer)
            w.resolve(evt)
            return false
          }
          return true
        })
      })
    })
  }

  send(type, data) {
    this.ws.send(
      JSON.stringify({
        ns: 'party.session',
        channelId: PREFIX + this.sessionId,
        type,
        data,
        ts: Date.now(),
      }),
    )
  }

  count(type, pred) {
    return this.events.filter(e => e.type === type && (!pred || pred(e.data))).length
  }

  typesSeen() {
    return [...new Set(this.events.map(e => e.type))].join(',')
  }

  waitFor(type, ms = 8000, pred) {
    const found = this.events.find(e => e.type === type && (!pred || pred(e.data)))
    if (found) return Promise.resolve(found)
    return new Promise((resolve, reject) => {
      const w = { type, pred, resolve: null, timer: null }
      w.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(x => x !== w)
        reject(new Error('[' + this.label + '] 等待 ' + type + ' 超时 ' + ms + 'ms；已收: ' + this.typesSeen()))
      }, ms)
      w.resolve = v => resolve(v)
      this.waiters.push(w)
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

/* ---------- 用例 A：all-hit 全链 ---------- */
async function runCaseAllHit() {
  console.log('\n== 用例 A：all-hit 全链（draw / rounds=1）==')
  const host = new Client('host(127.0.0.1)', '127.0.0.1')
  const guest = new Client('guest(127.0.0.2)', '127.0.0.2')
  const observer = new Client('observer(10.9.9.9)', '10.9.9.9')

  const created = await rest('POST', '/party/sessions', { gameType: 'draw', rounds: 1, level: 'gentle' }, host.xff)
  const sessionId = created && created.id
  ok(!!sessionId && created.gameType === 'draw', 'REST 建房 draw rounds=1 → id=' + sessionId)
  ;[host, guest, observer].forEach(c => (c.sessionId = sessionId))

  const joined = await rest('POST', `/party/sessions/${sessionId}/join`, { name: '观星小伙伴' }, guest.xff)
  ok(joined && joined.players && joined.players.length === 2, 'REST guest join → 房内 2 人')

  await rest('PATCH', `/party/sessions/${sessionId}/ready`, { ready: true }, guest.xff)

  await host.connect()
  await guest.connect()
  ok(true, 'WS 双客户端连接建立（XFF 区分身份，painter/guesser 不混叠）')

  const started = await rest('PATCH', `/party/sessions/${sessionId}/host`, { action: 'start' }, host.xff)
  ok(started && started.status === 'PLAYING', 'REST host start → PLAYING')

  await Promise.all([host.waitFor('session.start'), host.waitFor('players')])
  await Promise.all([guest.waitFor('session.start'), guest.waitFor('players')])
  ok(true, 'WS session.start + players 广播双端')

  const hr = await host.waitFor('draw.new_round', 6000)
  const gr = await guest.waitFor('draw.new_round', 6000)
  ok(hr.data.round === 1 && gr.data.round === 1, 'draw.new_round round=1 双端到达')
  ok(hr.data.cdSeconds === 60 && hr.data.roundsTotal === 1, 'new_round cdSeconds=60 / roundsTotal=1')

  const hostIsPainter = hr.data.word !== ''
  ok(hostIsPainter || gr.data.word !== '', 'painter 视角持有 word')
  const painter = hostIsPainter ? host : guest
  const guesser = hostIsPainter ? guest : host
  const word = (hostIsPainter ? hr : gr).data.word
  const painterView = hostIsPainter ? hr : gr
  const guesserView = hostIsPainter ? gr : hr
  ok(guesserView.data.word === '', '非 painter 视角 word=\'\'（词不可见）')
  ok(guesserView.data.wordLen === word.length, '非 painter 视角 wordLen=' + word.length + '（词长提示）')
  ok(typeof painterView.data.painterId === 'string' && typeof painterView.data.painterName === 'string', 'new_round painterId/painterName 渲染')

  // painter 落笔广播
  painter.send('draw.delta', { round: 1, stroke: { color: '#123456', width: 3, points: [[1, 2], [3, 4]] } })
  await Promise.all([
    host.waitFor('draw.delta', 5000, d => d.round === 1 && d.stroke && d.stroke.points[0][0] === 1),
    guest.waitFor('draw.delta', 5000, d => d.round === 1 && d.stroke && d.stroke.points[0][0] === 1),
  ])
  ok(true, 'draw.delta painter 落笔 → stroke 原样广播双端')

  // 非 painter 落笔：静默挡回（PRD 8.4）
  const deltaCountBefore = guesser.count('draw.delta')
  guesser.send('draw.delta', { round: 1, stroke: { color: '#000', width: 1, points: [[9, 9]] } })
  await sleep(800)
  ok(guesser.count('draw.delta') === deltaCountBefore, '非 painter 落笔被静默挡回（painter only）')

  // painter undo / clear 通道
  painter.send('draw.undo', { round: 1 })
  await Promise.all([host.waitFor('draw.undo', 5000, d => d.round === 1), guest.waitFor('draw.undo', 5000, d => d.round === 1)])
  painter.send('draw.clear', { round: 1 })
  await Promise.all([host.waitFor('draw.clear', 5000, d => d.round === 1 && d.cdSeconds === 60), guest.waitFor('draw.clear', 5000, d => d.round === 1)])
  ok(true, 'draw.undo {round} / draw.clear {round,cdSeconds} 广播双端（clear 重倒计时）')

  // 第三客户端入房回放（PRD 4.4 最近 20s）
  await observer.connect()
  const replay = await observer.waitFor('draw.replay', 5000)
  ok(replay.data.round === 1 && replay.data.word === '', 'draw.replay 观战回放（word 不可见）')
  ok(Array.isArray(replay.data.ops) && replay.data.ops.length >= 1 && replay.data.ops[0].op === 'clear', 'replay ops 首条为 clear（clear 重置语义）')
  ok(typeof replay.data.cdSeconds === 'number' && replay.data.cdSeconds >= 55 && replay.data.cdSeconds <= 60, 'replay cdSeconds 剩余秒 clamp（60±5）')

  // guess miss：首次广播流言
  const missText = '显然猜不中的错误词'
  guesser.send('draw.guess', { round: 1, text: missText })
  await Promise.all([
    host.waitFor('draw.guess_result', 5000, d => d.hit === false && typeof d.text === 'string' && d.text.includes(missText)),
    guest.waitFor('draw.guess_result', 5000, d => d.hit === false && typeof d.text === 'string' && d.text.includes(missText)),
  ])
  ok(true, 'guess miss → 流言广播双端（文本含错词）')

  // 重复错词挡回（镜像 _myWrong）
  const missCount = guesser.count('draw.guess_result')
  guesser.send('draw.guess', { round: 1, text: missText })
  await sleep(800)
  ok(guesser.count('draw.guess_result') === missCount, '重复错词静默挡回（无新增事件）')

  // painter 自猜挡回
  const prePainterGuess = guesser.count('draw.guess_result')
  painter.send('draw.guess', { round: 1, text: word })
  await sleep(800)
  ok(guesser.count('draw.guess_result') === prePainterGuess, 'painter 自猜被静默挡回')

  // 命中 → all-hold → summary
  guesser.send('draw.guess', { round: 1, text: word })
  const [hitH, hitG] = await Promise.all([
    host.waitFor('draw.guess_result', 5000, d => d.hit === true),
    guest.waitFor('draw.guess_result', 5000, d => d.hit === true),
  ])
  ok(hitH.data.guessersLeft === 0, 'guess_result hit=true 广播双端，guessersLeft=0（全员命中）')
  ok(typeof hitH.data.byId === 'string' && hitH.data.byId.length > 0, 'guess_result byId 视角化（' + hitH.data.byId + '）')
  ok(hitH.data.text.includes('猜中了') && hitH.data.byName.length > 0, '猜中文案 ' + hitH.data.text + '，byName=' + hitH.data.byName)

  const [sumH] = await Promise.all([host.waitFor('draw.round_summary', 6000), guest.waitFor('draw.round_summary', 6000)])
  ok(sumH.data.reason === 'all', 'round_summary reason=all（all-hit 1.2s hold 后结算）')
  ok(sumH.data.word === word, 'round_summary word 明牌=' + word)
  const deltas = sumH.data.deltas || []
  ok(Array.isArray(deltas) && deltas.length === 2, 'round_summary deltas 双行')
  const gDelta = deltas.find(d => d.delta === 30)
  const pDelta = deltas.find(d => d.delta === 20)
  ok(!!gDelta && !!pDelta, '首名猜中 +30 / painter +20')
  ok(typeof sumH.data.painter === 'string' && sumH.data.painter.length > 0, 'round_summary painter=' + sumH.data.painter)

  // 3.4s hold → gameover
  const [goH, goG] = await Promise.all([host.waitFor('gameover', 9000), guest.waitFor('gameover', 9000)])
  ok(goH.data.roundsPlayed === 1, 'gameover roundsPlayed=1')
  const contribs = goH.data.contributions || []
  ok(Array.isArray(contribs) && contribs.length === 2 && contribs[0].score >= contribs[1].score, 'gameover contributions 降序两条')
  ok(typeof goH.data.mvpId === 'string' && goH.data.mvpId.length > 0, 'gameover mvpId 视角化（' + goH.data.mvpId + '）')
  ok(contribs[0].score === 30 || contribs[0].score === 20, '榜首得分=' + contribs[0].score + '（guess 30 或 painter 20）')
  ok(goH && goG, 'gameover 双端到达')

  // PartyRound 落库（fire-and-forget，轮询）
  const roundRow = await waitForDb(async () => {
    const rows = await prisma.partyRound.findMany({ where: { sessionId } })
    return rows.length === 1 ? rows[0] : null
  }, 5000)
  ok(!!roundRow, 'PartyRound 落库 1 条')
  ok(roundRow && roundRow.data.reason === 'all' && roundRow.data.word === word, 'PartyRound.data reason=all / word=' + (roundRow && roundRow.data.word))

  // session 转 SETTLING（fire-and-forget，轮询）
  const settleRow = await waitForDb(async () => {
    const s = await prisma.partySession.findUnique({ where: { id: sessionId } })
    return s && s.status === 'SETTLING' ? s : null
  }, 5000)
  ok(!!settleRow, '会话落档 status=SETTLING')

  // close 清场：session.close 广播 + CLOSED
  const closeP = host.waitFor('session.close', 5000)
  const closed = await rest('PATCH', `/party/sessions/${sessionId}/host`, { action: 'close' }, host.xff)
  await closeP
  ok(closed && closed.status === 'CLOSED', 'REST close → CLOSED + session.close 广播')

  ;[host, guest, observer].forEach(c => c.close())
}

/* ---------- 用例 B：host skip 链 ---------- */
async function runCaseSkip() {
  console.log('\n== 用例 B：host skip（draw / rounds=1）==')
  const hostB = new Client('hostB(192.0.2.1)', '192.0.2.1')
  const guestB = new Client('guestB(192.0.2.2)', '192.0.2.2')

  const created = await rest('POST', '/party/sessions', { gameType: 'draw', rounds: 1, level: 'standard' }, hostB.xff)
  const sessionId = created && created.id
  ok(!!sessionId, '[B] 建房 → id=' + sessionId)
  ;[hostB, guestB].forEach(c => (c.sessionId = sessionId))

  await rest('POST', `/party/sessions/${sessionId}/join`, { name: '跳过君' }, guestB.xff)
  await rest('PATCH', `/party/sessions/${sessionId}/ready`, { ready: true }, guestB.xff)

  await hostB.connect()
  await guestB.connect()
  const started = await rest('PATCH', `/party/sessions/${sessionId}/host`, { action: 'start' }, hostB.xff)
  ok(started && started.status === 'PLAYING', '[B] start → PLAYING')

  await Promise.all([hostB.waitFor('draw.new_round', 6000), guestB.waitFor('draw.new_round', 6000)])
  ok(true, '[B] draw.new_round 双端到达')

  // 非 host skip：静默挡回
  const summaryCount = hostB.count('draw.round_summary')
  guestB.send('draw.skip', {})
  await sleep(900)
  ok(hostB.count('draw.round_summary') === summaryCount, '[B] 非 host 跳过被静默挡回')

  // host skip → reason=skip → 3.4s 后 gameover
  hostB.send('draw.skip', {})
  const [sumH] = await Promise.all([
    hostB.waitFor('draw.round_summary', 6000),
    guestB.waitFor('draw.round_summary', 6000),
  ])
  ok(sumH.data.reason === 'skip', '[B] round_summary reason=skip')

  const [goH] = await Promise.all([hostB.waitFor('gameover', 9000), guestB.waitFor('gameover', 9000)])
  ok(goH.data.roundsPlayed === 1, '[B] gameover roundsPlayed=1')

  const rows = await waitForDb(async () => {
    const r = await prisma.partyRound.findMany({ where: { sessionId } })
    return r.length === 1 ? r : null
  }, 5000)
  ok(!!rows && rows[0].data.reason === 'skip', '[B] PartyRound 落库 reason=skip（skip 不计 painter 保底）')
  const srow = await waitForDb(async () => {
    const s = await prisma.partySession.findUnique({ where: { id: sessionId } })
    return s && s.status === 'SETTLING' ? s : null
  }, 5000)
  ok(!!srow, '[B] 会话落档 SETTLING')

  ;[hostB, guestB].forEach(c => c.close())
}

/* ---------- 入口 ---------- */
async function main() {
  console.log('party WS draw 策略全链冒烟 · 开始于 ' + new Date().toLocaleString())
  try {
    await runCaseAllHit()
  } catch (e) {
    failed++
    failures.push('用例 A 异常中断: ' + e.message)
    console.log('  ✗ 用例 A 异常中断: ' + e.message)
  }
  try {
    await runCaseSkip()
  } catch (e) {
    failed++
    failures.push('用例 B 异常中断: ' + e.message)
    console.log('  ✗ 用例 B 异常中断: ' + e.message)
  }
  console.log('\n冒烟汇总：PASS ' + passed + ' / FAIL ' + failed)
  if (failed > 0) {
    console.log('失败清单：')
    failures.forEach(f => console.log('  ✗ ' + f))
    process.exitCode = 1
  } else {
    console.log('全链冒烟通过：draw 策略（new_round 视角化/delta/undo/clear/replay/guess 判定挡回/all-hit/all+skip 结算/gameover/落库/清场）')
  }
  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('冒烟脚本异常:', e)
  process.exitCode = 1
  try {
    await prisma.$disconnect()
  } catch {
    /* ignore */
  }
})
