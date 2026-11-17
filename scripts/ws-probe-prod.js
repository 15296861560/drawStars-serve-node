/* eslint-disable no-console */
/**
 * drawStars-serve-node —— 生产服务器「开始对局广播」探针
 *
 * 目的：验证线上 serve.drawstars.cn 在 host start 后，是否会向频道内
 * 其他成员广播 session.start / draw.new_round（对齐 ws-smoke-draw.js 用例 A，
 * 但走 https/wss + x-ds-device-key 身份，不污染 IP 身份段）。
 *
 * 运行：node scripts/ws-probe-prod.js
 */
const https = require('https')
const crypto = require('crypto')
const WebSocket = require('ws')

const HOST = 'serve.drawstars.cn'
const PREFIX = 'party.session.'
const devKey = () => crypto.randomBytes(16).toString('hex')

function rest(method, p, body, deviceKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : ''
    const req = https.request(
      {
        host: HOST,
        path: p,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-ds-device-key': deviceKey,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          let parsed = null
          try {
            parsed = JSON.parse(raw)
          } catch {
            /* keep raw */
          }
          resolve({ http: res.statusCode, json: parsed, raw: raw.slice(0, 300) })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('REST 超时 ' + method + ' ' + p)))
    req.end(payload)
  })
}

class Client {
  constructor(label, deviceKey) {
    this.label = label
    this.deviceKey = deviceKey
    this.sessionId = ''
    this.ws = null
    this.events = []
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${HOST}/ws?channel=${PREFIX}${this.sessionId}`, {
        headers: { 'x-ds-device-key': this.deviceKey },
      })
      this.ws = ws
      const kill = setTimeout(
        () => reject(new Error(this.label + ' WS 连接超时')),
        15000,
      )
      ws.on('open', () => {
        clearTimeout(kill)
        console.log('  [ws] ' + this.label + ' 连接建立')
        resolve()
      })
      ws.on('error', e => {
        clearTimeout(kill)
        reject(e)
      })
      ws.on('close', () => this.events.push({ at: Date.now(), type: '__closed__' }))
      ws.on('message', raw => {
        let msg
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }
        if (!msg || typeof msg.type !== 'string') return
        this.events.push({ at: Date.now(), type: msg.type, data: msg.data || {} })
      })
    })
  }
  waitFor(type, ms) {
    const found = this.events.find(e => e.type === type)
    if (found) return Promise.resolve(found)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `[${this.label}] 等待 ${type} 超时 ${ms}ms；已收: ` +
              [...new Set(this.events.map(e => e.type))].join(','),
          ),
        )
      }, ms)
      const timerId = setInterval(() => {
        const hit = this.events.find(e => e.type === type)
        if (hit) {
          clearTimeout(timer)
          clearInterval(timerId)
          resolve(hit)
        }
      }, 200)
    })
  }
  close() {
    try {
      this.ws && this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log('生产探针 · ' + new Date().toLocaleString())
  const host = new Client('host', devKey())
  const guest = new Client('guest', devKey())

  const created = await rest('POST', '/party/sessions', { gameType: 'draw', rounds: 1, level: 'gentle' }, host.deviceKey)
  console.log('  [rest] 建房 →', created.http, JSON.stringify(created.json && created.json.id ? { id: created.json.id } : created.raw).slice(0, 200))
  const sessionId = created.json && (created.json.id || (created.json.data && created.json.data.id))
  if (!sessionId) throw new Error('建房失败: ' + created.raw)
  host.sessionId = sessionId
  guest.sessionId = sessionId

  const joined = await rest('POST', `/party/sessions/${sessionId}/join`, { name: '探针访客' }, guest.deviceKey)
  console.log('  [rest] 访客join →', joined.http, JSON.stringify(joined.json && joined.json.players && { players: joined.json.players.length }).slice(0, 200))

  await rest('PATCH', `/party/sessions/${sessionId}/ready`, { ready: true }, guest.deviceKey)

  await host.connect()
  await guest.connect()
  await sleep(500)

  console.log('  --- host 发起 start ---')
  const started = await rest('PATCH', `/party/sessions/${sessionId}/host`, { action: 'start' }, host.deviceKey)
  console.log('  [rest] start →', started.http, started.raw.slice(0, 200))

  let pass = 0
  let fail = 0
  const check = async (c, type, label) => {
    try {
      const evt = await c.waitFor(type, 12000)
      pass++
      console.log(`  ✓ [${c.label}] 收到 ${label || type}`, JSON.stringify(evt.data).slice(0, 160))
    } catch (e) {
      fail++
      console.log('  ✗ ' + e.message)
    }
  }

  await Promise.all([check(guest, 'session.start', 'session.start（成员收到开局推送）')])
  await Promise.all([check(guest, 'draw.new_round'), check(host, 'draw.new_round')])

  // 收尾：直接 close 清场，避免留一个 PLAYING 残局
  const closed = await rest('PATCH', `/party/sessions/${sessionId}/host`, { action: 'close' }, host.deviceKey)
  console.log('  [rest] close →', closed.http, closed.raw.slice(0, 120))

  host.close()
  guest.close()
  console.log(`\n探针汇总：PASS ${pass} / FAIL ${fail}`)
  process.exitCode = fail > 0 ? 1 : 0
}

main().catch(e => {
  console.error('探针异常:', e.message)
  process.exitCode = 1
})
