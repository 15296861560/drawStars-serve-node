/**
 * Party 模块演示数据 seed（幂等，可重复执行）。
 * 覆盖：
 * - party_profile：本机联调者 + 3 位星愿墙 NPC
 * - star_wish：联调者（updateKey 置为昨天，今天可再保存一次验证当日限改）+ NPC 墙内容
 * - star_wish_like：种子墙条目点赞 + 用户星愿点赞（likes/liked 渲染）
 * - party_session / party_session_player：1 场 CLOSED（历史趣局）+ 1 场 WAITING（大厅快照）
 * - party_card：CLOSED 会话的纪念卡（mockCard 同形库卡）
 * - party_badge：12 枚徽章运营位入库
 * - party_question / party_wordbank：占位迁移示意数据（运行时仍取 data/*.js）
 * Run: npm run prisma:seed-party
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DAY = 86400000

/** 本机联调者 clientKey：无 token 时 resolveClientKey 回退 'ip_' + 内网地址 */
const ME = 'ip_127.0.0.1'
const NPC1 = 'ip_10.0.0.201' // 小鹿
const NPC2 = 'ip_10.0.0.202' // 鲸鱼
const NPC3 = 'ip_10.0.0.203' // 桃桃

const pad = (n: number) => String(n).padStart(2, '0')

/** 与 party.util.dayKey 同口径：YYYYMMDD */
function dayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY)
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
}

/** 与 party.util.fmtDate 同口径：YYYY-MM-DD */
function fmtDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ---------- 1. 星聚档案 ---------- */
const PROFILES = [
  { clientKey: ME, name: '联调星旅人', starVal: 86 },
  { clientKey: NPC1, name: '小鹿', starVal: 320 },
  { clientKey: NPC2, name: '鲸鱼', starVal: 145 },
  { clientKey: NPC3, name: '桃桃', starVal: 512 },
]

/* ---------- 2. 星愿 ---------- */
const TOD_SESSION_ID = 'seed_ps_tod_001'
const DRAW_SESSION_ID = 'seed_ps_draw_002'

const WISHES = [
  {
    id: 'seed_wish_001',
    clientKey: ME,
    text: '今晚想把星星排成队，说一句慢一点的好梦',
    theme: '愿望',
    updatedAt: new Date(Date.now() - DAY), // 昨日提交
    updateKey: dayKey(-1), // 今天的 PUT /wish 仍可保存一次
  },
  {
    id: 'seed_wish_101',
    clientKey: NPC1,
    text: '想和不吵架的人一起去看一次银河',
    theme: '旅行',
    updatedAt: new Date(Date.now() - 5 * DAY),
    updateKey: dayKey(-5),
  },
  {
    id: 'seed_wish_102',
    clientKey: NPC2,
    text: '愿所有没说完的话都有续杯的机会',
    theme: '遗憾',
    updatedAt: new Date(Date.now() - 4 * DAY),
    updateKey: dayKey(-4),
  },
  {
    id: 'seed_wish_103',
    clientKey: NPC3,
    text: '下学期想坐第一排，和阳光一起认真学习',
    theme: '青春',
    updatedAt: new Date(Date.now() - 3 * DAY),
    updateKey: dayKey(-3),
  },
]

/** 星愿渲染 id：'wish_' + star_wish.id（wall/like 端点口径） */
const wishId = (id: string) => 'wish_' + id

/* ---------- 3. 点赞（wishId + clientKey 幂等去重） ---------- */
const LIKES = [
  { id: 'seed_lk_001', wishId: 'w_01', clientKey: ME }, // 种子墙条目 → liked=true 演示
  { id: 'seed_lk_002', wishId: 'w_03', clientKey: ME },
  { id: 'seed_lk_011', wishId: wishId('seed_wish_101'), clientKey: NPC1 },
  { id: 'seed_lk_012', wishId: wishId('seed_wish_101'), clientKey: NPC2 },
  { id: 'seed_lk_013', wishId: wishId('seed_wish_101'), clientKey: NPC3 },
  { id: 'seed_lk_021', wishId: wishId('seed_wish_102'), clientKey: NPC1 },
  { id: 'seed_lk_031', wishId: wishId('seed_wish_001'), clientKey: NPC1 }, // 联调者的愿被点赞
  { id: 'seed_lk_032', wishId: wishId('seed_wish_001'), clientKey: NPC3 },
]

/* ---------- 4. 趣局 + 席位 ---------- */
const TOD_CLOSED_AT = new Date(Date.now() - 3 * DAY + 48 * 60000)
const TOD_STARTED_AT = new Date(Date.now() - 3 * DAY)

const SESSIONS = [
  {
    id: TOD_SESSION_ID,
    code: 'QXT2YD', // 口令字符集（剔 0/O/1/I）内取值
    gameType: 'tod',
    level: 'standard',
    themeTags: ['青春', '深夜'],
    rounds: 5,
    currentRound: 5,
    playerLimit: 4,
    penaltyMode: 'text',
    penaltyText: '向左侧邻座喝一杯',
    joker: false,
    status: 'CLOSED',
    createdAtT: Date.now() - 3 * DAY,
    startedAt: TOD_STARTED_AT,
    closedAt: TOD_CLOSED_AT,
    players: [
      { id: 'seed_pl_001', clientKey: ME, name: '联调星旅人', isHost: true, ready: true },
      { id: 'seed_pl_002', clientKey: NPC1, name: '小鹿', isHost: false, ready: true },
      { id: 'seed_pl_003', clientKey: NPC2, name: '鲸鱼', isHost: false, ready: true },
      { id: 'seed_pl_004', clientKey: NPC3, name: '桃桃', isHost: false, ready: true },
    ],
  },
  {
    id: DRAW_SESSION_ID,
    code: 'PCW4HP',
    gameType: 'draw',
    level: 'gentle',
    themeTags: ['生活日常'],
    rounds: 3,
    currentRound: 0,
    playerLimit: 6,
    penaltyMode: 'text',
    penaltyText: '唱两句最拿手的歌',
    joker: false,
    status: 'WAITING',
    createdAtT: Date.now() - 3600000,
    startedAt: null,
    closedAt: null,
    players: [
      { id: 'seed_pl_011', clientKey: ME, name: '联调星旅人', isHost: true, ready: true },
      { id: 'seed_pl_012', clientKey: NPC1, name: '小鹿', isHost: false, ready: false },
    ],
  },
]

/* ---------- 5. 纪念卡（mockCard 同形；card 端点命中库卡即原样返回） ---------- */
function cardData(sessionId: string, code: string) {
  const host = SESSIONS[0].players[0]
  return {
    id: 'card_' + sessionId,
    title: '拾星纪念卡',
    sessionMeta: {
      sessionId,
      gameType: 'tod',
      gameName: '真心话大冒险',
      code,
      playedAt: fmtDate(TOD_CLOSED_AT.getTime()),
      rounds: 5,
      playerCount: 4,
    },
    players: SESSIONS[0].players.map(p => ({
      id: p.clientKey,
      name: p.name,
      avatar: '',
      score: 0,
      mvp: p.isHost,
      badge: p.isHost ? '温柔到心动的星' : '', // MVP_BADGES.tod
    })),
    starWish: '愿我们每次抬头，都刚好有星星在赶来的路上。',
    background: 'starry_night_v1', // CARD_BACKGROUND
    shareCardUrl: '',
    shareId: 'share_' + sessionId,
  }
}

/* ---------- 6. 徽章运营位（constants.BADGES 12 枚入库） ---------- */
const BADGES = [
  { key: 'first_star', emoji: '⭐', label: '第一颗星', condition: '完成首场对局' },
  { key: 'tod_master', emoji: '💫', label: '真心话大师', condition: '累计完成 50 题' },
  { key: 'draw_talent', emoji: '🖌️', label: '神笔马良', condition: '你画我猜猜对 30 次' },
  { key: 'lady_arrival', emoji: '🎴', label: '小姐驾到', condition: '抽中「小姐」5 次' },
  { key: 'bluff_king', emoji: '🃏', label: '瞎掰之王', condition: '累计被投票 10 次' },
  { key: 'dice_killer', emoji: '🎯', label: '骰子杀手', condition: '开牌成功 20 次' },
  { key: 'convener', emoji: '📣', label: '召集人', condition: '创建 10 场对局' },
  { key: 'social_star', emoji: '🌟', label: '八面玲珑', condition: '单场 8 人局房主' },
  { key: 'night_owl', emoji: '🌃', label: '星夜不倦', condition: '连续 3 天拾星趣局' },
  { key: 'gentle_heart', emoji: '🤍', label: '温柔以对', condition: '单场零跳过' },
  { key: 'star_marker', emoji: '✨', label: '点星的人', condition: '星愿被点赞 50 次' },
  { key: 'star_messenger', emoji: '💌', label: '拾星信使', condition: '纪念卡分享 10 次' },
]

/* ---------- 7. 题库 / 词库占位迁移示意（运行时仍由 data/*.js 供题） ---------- */
const QUESTIONS = [
  { id: 'seed_q_001', gameType: 'tod', kind: 'truth', level: 'gentle', themes: ['青春'], text: '最近一次让你笑出声的事是什么？' },
  { id: 'seed_q_002', gameType: 'tod', kind: 'dare', level: 'gentle', themes: ['深夜'], text: '模仿一种动物的叫声，让大家猜。' },
  { id: 'seed_q_003', gameType: 'tod', kind: 'truth', level: 'standard', themes: ['遗憾'], text: '讲一个你到现在都没告诉室友的小秘密。' },
]

const WORDBANK = [
  { id: 'seed_wb_001', level: 'easy', theme: '生活日常', word: '牙刷' },
  { id: 'seed_wb_002', level: 'mid', theme: '自然星野', word: '流星雨' },
  { id: 'seed_wb_003', level: 'hard', theme: '深夜食堂', word: '月光吐司' },
  { id: 'seed_wb_004', level: 'mid', theme: '星夜童话', word: '许愿池' },
]

/* ---------- 执行 ---------- */
async function main() {
  console.log('[seed-party] start')

  for (const p of PROFILES) {
    await prisma.partyProfile.upsert({
      where: { clientKey: p.clientKey },
      create: { id: 'seed_pf_' + p.clientKey, clientKey: p.clientKey, name: p.name, starVal: p.starVal },
      update: { name: p.name, starVal: p.starVal },
    })
  }
  console.log('[seed-party] party_profile x', PROFILES.length)

  for (const w of WISHES) {
    await prisma.starWish.upsert({
      where: { clientKey: w.clientKey },
      create: w,
      update: { text: w.text, theme: w.theme, updatedAt: w.updatedAt, updateKey: w.updateKey },
    })
  }
  console.log('[seed-party] star_wish x', WISHES.length)

  for (const l of LIKES) {
    await prisma.starWishLike.upsert({
      where: { wishId_clientKey: { wishId: l.wishId, clientKey: l.clientKey } },
      create: l,
      update: {},
    })
  }
  console.log('[seed-party] star_wish_like x', LIKES.length)

  for (const s of SESSIONS) {
    await prisma.partySession.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        code: s.code,
        gameType: s.gameType,
        level: s.level,
        themeTags: s.themeTags,
        rounds: s.rounds,
        currentRound: s.currentRound,
        playerLimit: s.playerLimit,
        penaltyMode: s.penaltyMode,
        penaltyText: s.penaltyText,
        joker: s.joker,
        status: s.status,
        createdAt: new Date(s.createdAtT),
        startedAt: s.startedAt,
        closedAt: s.closedAt,
      },
      update: {
        code: s.code,
        status: s.status,
        currentRound: s.currentRound,
        startedAt: s.startedAt,
        closedAt: s.closedAt,
      },
    })

    for (const p of s.players) {
      await prisma.partySessionPlayer.upsert({
        where: { sessionId_clientKey: { sessionId: s.id, clientKey: p.clientKey } },
        create: {
          id: p.id,
          sessionId: s.id,
          clientKey: p.clientKey,
          name: p.name,
          isHost: p.isHost,
          ready: p.ready,
        },
        update: { name: p.name, isHost: p.isHost, ready: p.ready },
      })
    }
  }
  console.log('[seed-party] party_session(+players) x', SESSIONS.length)

  const data = cardData(TOD_SESSION_ID, 'QXT2YD')
  await prisma.partyCard.upsert({
    where: { id: data.id },
    create: { id: data.id, sessionId: TOD_SESSION_ID, data: data as object },
    update: { data: data as object },
  })
  console.log('[seed-party] party_card x 1')

  for (const b of BADGES) {
    await prisma.partyBadge.upsert({
      where: { key: b.key },
      create: { id: 'seed_bg_' + b.key, ...b },
      update: { emoji: b.emoji, label: b.label, condition: b.condition },
    })
  }
  console.log('[seed-party] party_badge x', BADGES.length)

  for (const q of QUESTIONS) {
    await prisma.partyQuestion.upsert({
      where: { id: q.id },
      create: { ...q, themes: q.themes },
      update: { text: q.text },
    })
  }
  for (const w of WORDBANK) {
    await prisma.partyWordbank.upsert({
      where: { id: w.id },
      create: w,
      update: { word: w.word },
    })
  }
  console.log('[seed-party] party_question x', QUESTIONS.length, '/ party_wordbank x', WORDBANK.length)

  console.log('[seed-party] done')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
