/**
 * 心智测评（问星）v1.0 上线内容 seed（幂等，可重复执行）。
 * 覆盖 PRD 4.4.1 全量登记的三型首发内容：
 * - archetype  心智原型·八卦人格（M1 八维判定，8 题 × 4 选项，每维出现 4 次）
 * - emotion    情绪能量·四象扫描（M2 四维能量，5 题 × 4 选项，每题一维一项 pts=3）
 * - quick_daily 每日一签·能量打卡（M0 每日一签，1 题 × 5 档 score）
 * 每型建一条独立问卷（radio 题型，选项 config 携带 dim/pts 或 score）、
 * 发布配置（shareCode，免登录），并上架 assessment_info（status=1）。
 * Run: npm run prisma:seed-assessment-content
 */
import { PrismaClient } from '@prisma/client'
import { randomInt } from 'crypto'

const prisma = new PrismaClient()

/** 与发布配置既有风格一致的 8 位 shareCode 生成器 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function genShareCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)]
  return s
}

/** 选项定义：文本 + 判定配置（M1/M2 用 dim/pts，M0 用 score） */
type OptDef = { text: string; dim?: string; pts?: number; score?: number }
type QDef = { title: string; options: OptDef[] }
type PaperDef = {
  /** assessment_info.type_key，须与 ASSESSMENT_TYPE_REGISTRY 对齐 */
  typeKey: 'archetype' | 'emotion' | 'quick_daily'
  surveyTitle: string
  description: string
  infoTitle: string
  subtitle: string
  tags: string
  durationDesc: string
  sort: number
  questions: QDef[]
}

/* ------------------------------ 1. archetype · M1 八维 ------------------------------ */
/* 每题 4 个选项分属 4 个卦维（每维全卷恰好出现 4 次），被选中则该维 +pts */
const ARCHETYPE: QDef[] = [
  {
    title: '项目例会陷入僵局、迟迟无法收尾，你的第一反应更接近？',
    options: [
      { text: '快速拍板，选定一个方向先推进', dim: 'qian', pts: 1 },
      { text: '直接抛出新思路，把局面搅动起来', dim: 'zhen', pts: 1 },
      { text: '先追问数据与原因，把卡点想清楚', dim: 'kan', pts: 1 },
      { text: '建议暂停十分钟，稳一稳再继续', dim: 'gen', pts: 1 }
    ]
  },
  {
    title: '团队里来了新伙伴，你更可能？',
    options: [
      { text: '主动搭话介绍大家，很快热络起来', dim: 'dui', pts: 1 },
      { text: '留意TA的喜好和表达，找机会共鸣', dim: 'li', pts: 1 },
      { text: '观察TA的节奏，灵活配合不越界', dim: 'xun', pts: 1 },
      { text: '默默记下TA需要什么，顺手帮一把', dim: 'kun', pts: 1 }
    ]
  },
  {
    title: '接手一个全新领域的事，你的第一步是？',
    options: [
      { text: '先定目标与里程碑，倒排计划', dim: 'qian', pts: 1 },
      { text: '先把相关的人约一遍，聊透背景', dim: 'dui', pts: 1 },
      { text: '先摸清环境与规则，边动边调', dim: 'xun', pts: 1 },
      { text: '先排查风险与未知，列出问题清单', dim: 'kan', pts: 1 }
    ]
  },
  {
    title: '原定计划突然被打乱，你会？',
    options: [
      { text: '立即调整动作，先动起来再说', dim: 'zhen', pts: 1 },
      { text: '重新梳理哪部分对自己最重要', dim: 'li', pts: 1 },
      { text: '保持原有节奏，按部就班补齐', dim: 'gen', pts: 1 },
      { text: '接住变化，先安抚受影响的人', dim: 'kun', pts: 1 }
    ]
  },
  {
    title: '你理想中的工作状态更像？',
    options: [
      { text: '目标明确，一路里程碑达成', dim: 'qian', pts: 1 },
      { text: '随机应变，在变化里找机会', dim: 'xun', pts: 1 },
      { text: '协作热络，和人一起做事最开心', dim: 'dui', pts: 1 },
      { text: '高速运转，不断突破极限', dim: 'zhen', pts: 1 }
    ]
  },
  {
    title: '遇到难啃的问题，你会？',
    options: [
      { text: '沉下心来钻研，不搞明白不放手', dim: 'kan', pts: 1 },
      { text: '日拱一卒，用耐心慢慢磨', dim: 'gen', pts: 1 },
      { text: '换个视角，从「为什么」重新理解', dim: 'li', pts: 1 },
      { text: '找伙伴一起拆解，有人一起就不慌', dim: 'kun', pts: 1 }
    ]
  },
  {
    title: '朋友形容你的沟通风格，多半是？',
    options: [
      { text: '直接了当，结论先行', dim: 'qian', pts: 1 },
      { text: '亲切健谈，和你聊天很舒服', dim: 'dui', pts: 1 },
      { text: '表达有画面感，容易感染人', dim: 'li', pts: 1 },
      { text: '看对象切换方式，怎么聊都自然', dim: 'xun', pts: 1 }
    ]
  },
  {
    title: '压力最大的那段日子，你是怎么过的？',
    options: [
      { text: '高强度行动，用做事消化压力', dim: 'zhen', pts: 1 },
      { text: '独处静思，把问题想透再出发', dim: 'kan', pts: 1 },
      { text: '维持秩序，守住生活不失序', dim: 'gen', pts: 1 },
      { text: '先照顾好自己和身边人的情绪', dim: 'kun', pts: 1 }
    ]
  }
]

/* ------------------------------ 2. emotion · M2 四维 ------------------------------ */
/* 每题 4 个选项分属 calm/joy/anxiety/fatigue 四维之一，被选中该维 +3 */
const EMOTION: QDef[] = [
  {
    title: '此刻回看今天，你的状态更像哪一幅画面？',
    options: [
      { text: '晴天出游，轻快明亮', dim: 'joy', pts: 3 },
      { text: '湖面小船，平稳安静', dim: 'calm', pts: 3 },
      { text: '赶末班车，紧张匆忙', dim: 'anxiety', pts: 3 },
      { text: '深夜加班后，电量见底', dim: 'fatigue', pts: 3 }
    ]
  },
  {
    title: '看到明天排满的安排，你的第一感觉？',
    options: [
      { text: '稳稳的，按部就班就好', dim: 'calm', pts: 3 },
      { text: '挺好，充实有奔头', dim: 'joy', pts: 3 },
      { text: '心里一紧，怕来不及', dim: 'anxiety', pts: 3 },
      { text: '光是想想就累了', dim: 'fatigue', pts: 3 }
    ]
  },
  {
    title: '朋友聚会上，你更像？',
    options: [
      { text: '气氛担当，笑声不断', dim: 'joy', pts: 3 },
      { text: '安静倾听，适时接话', dim: 'calm', pts: 3 },
      { text: '担心冷场，时刻照顾气氛', dim: 'anxiety', pts: 3 },
      { text: '想早点回家，独自充电', dim: 'fatigue', pts: 3 }
    ]
  },
  {
    title: '睡前躺下的那一刻，脑海里大多是？',
    options: [
      { text: '很快放空，自然入睡', dim: 'calm', pts: 3 },
      { text: '想起今天开心的事，嘴角上扬', dim: 'joy', pts: 3 },
      { text: '翻来覆去盘算明天的安排', dim: 'anxiety', pts: 3 },
      { text: '累到一片空白', dim: 'fatigue', pts: 3 }
    ]
  },
  {
    title: '这个周末，你最真实的愿望是？',
    options: [
      { text: '约上朋友出门撒欢', dim: 'joy', pts: 3 },
      { text: '在家喝茶发呆，静一静', dim: 'calm', pts: 3 },
      { text: '把积压的待办清完，不然不安心', dim: 'anxiety', pts: 3 },
      { text: '哪儿也不去，睡到自然醒', dim: 'fatigue', pts: 3 }
    ]
  }
]

/* ------------------------------ 3. quick_daily · M0 ------------------------------ */
/* 单题抽签：选项 score 直接映射 0-100 能量分 */
const QUICK_DAILY: QDef[] = [
  {
    title: '今日心理能量，抽一签看看？（选择最贴近当下的那一档）',
    options: [
      { text: '元气满格，光照四方', score: 95 },
      { text: '电量充足，节奏在线', score: 75 },
      { text: '不急不徐，平常心', score: 55 },
      { text: '有点低电量，需要小憩', score: 35 },
      { text: '电量告急，今天先放过自己', score: 15 }
    ]
  }
]

const PAPERS: PaperDef[] = [
  {
    typeKey: 'archetype',
    surveyTitle: '心智原型·八卦人格（问星 M1）',
    description:
      '八道情境抉择，照见你的主导卦象。依据 M1 八维判定模型（乾坤震巽坎离艮兑），从你的选择里读出主导心理原型、明亮面与盲区。',
    infoTitle: '心智原型·八卦人格',
    subtitle: '八道情境抉择，照见你的主导卦象',
    tags: 'HOT',
    durationDesc: '约3分钟',
    sort: 30,
    questions: ARCHETYPE
  },
  {
    typeKey: 'emotion',
    surveyTitle: '情绪能量·四象扫描（问星 M2）',
    description:
      '五道体感题，读出你此刻的情绪配比。依据 M2 四维能量模型（平静/喜悦/焦虑/疲惫），给出当前能量画像与调节建议。',
    infoTitle: '情绪能量·四象扫描',
    subtitle: '五道体感题，读出你此刻的情绪配比',
    tags: 'NEW',
    durationDesc: '约2分钟',
    sort: 20,
    questions: EMOTION
  },
  {
    typeKey: 'quick_daily',
    surveyTitle: '每日一签·能量打卡（问星 M0）',
    description: '一题抽签，领取今日份心理能量签。轻量打卡，天天可测，追踪你的能量曲线。',
    infoTitle: '每日一签·能量打卡',
    subtitle: '一题抽签，领取今日份好运签文',
    tags: 'FREE',
    durationDesc: '1分钟',
    sort: 10,
    questions: QUICK_DAILY
  }
]

/** 建一份测评卷：问卷 + 题目选项 + 发布配置，返回 surveyId（已存在则直接复用） */
async function ensurePaper(def: PaperDef): Promise<bigint> {
  // 幂等锚点：同名未删除问卷视为已建
  const existed = await prisma.survey.findFirst({
    where: { title: def.surveyTitle, deletedAt: null },
    select: { id: true }
  })
  if (existed) {
    const id = existed.id
    await ensurePublish(id)
    await ensureInfoRow(id, def)
    return id
  }

  const survey = await prisma.survey.create({
    data: {
      title: def.surveyTitle,
      description: def.description,
      type: 'normal',
      status: 'published',
      creatorId: 1n,
      scoringEnabled: false
    }
  })
  const surveyId = survey.id

  let qOrder = 0
  for (const q of def.questions) {
    qOrder += 1
    const question = await prisma.surveyQuestion.create({
      data: {
        surveyId,
        type: 'radio',
        title: q.title,
        sortOrder: qOrder,
        pageIndex: 1,
        required: true,
        config: {}
      }
    })
    let oOrder = 0
    for (const o of q.options) {
      oOrder += 1
      await prisma.surveyOption.create({
        data: {
          questionId: question.id,
          content: o.text,
          sortOrder: oOrder,
          // 判定配置：M1/M2 用 dim/pts，M0 用 score（与报告聚合服务读取口径一致）
          config: (o.dim
            ? { dim: o.dim, pts: o.pts ?? 1 }
            : { score: o.score ?? 0 }) as object
        }
      })
    }
  }

  await ensurePublish(surveyId)
  await ensureInfoRow(surveyId, def)
  return surveyId
}

/** 发布配置（shareCode 唯一），已存在则跳过 */
async function ensurePublish(surveyId: bigint) {
  const existed = await prisma.surveyPublishConfig.findUnique({
    where: { surveyId }
  })
  if (existed) return
  // 生成不重复的 shareCode
  let code = genShareCode()
  for (let i = 0; i < 8; i++) {
    const dup = await prisma.surveyPublishConfig.findFirst({
      where: { shareCode: code }
    })
    if (!dup) break
    code = genShareCode()
  }
  await prisma.surveyPublishConfig.create({
    data: {
      surveyId,
      shareCode: code,
      publishTime: new Date(),
      requireLogin: 'none',
      limitPerUser: 0,
      maxResponses: null,
      expireTime: null
    }
  })
}

/** 上架 assessment_info（status=1），同名视为已上架 */
async function ensureInfoRow(surveyId: bigint, def: PaperDef) {
  const existed = await prisma.assessmentInfo.findFirst({
    where: { title: def.infoTitle },
    select: { id: true }
  })
  if (existed) return
  await prisma.assessmentInfo.create({
    data: {
      title: def.infoTitle,
      typeKey: def.typeKey,
      surveyId,
      subtitle: def.subtitle,
      tags: def.tags,
      questionNum: def.questions.length,
      durationDesc: def.durationDesc,
      sort: def.sort,
      status: 1,
      publishedAt: new Date(),
      creatorId: 1n
    }
  })
}

async function main() {
  console.log('== 心智测评（问星）v1.0 内容种子开始 ==')
  for (const def of PAPERS) {
    const surveyId = await ensurePaper(def)
    const pub = await prisma.surveyPublishConfig.findUnique({
      where: { surveyId }
    })
    const info = await prisma.assessmentInfo.findFirst({
      where: { title: def.infoTitle },
      select: { id: true, status: true }
    })
    console.log(
      `[${def.typeKey}] survey#${surveyId} shareCode=${pub?.shareCode} info#${info?.id}(status=${info?.status})`
    )
  }
  const total = await prisma.assessmentInfo.count({ where: { status: 1 } })
  console.log(`已上架测评: ${total} 条`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
