/**
 * 心智测评（问星）领域常量
 * 与前端 drawStars-Vue3/src/config/assessment-registry.ts 保持一致；
 * 后端用于报告聚合、上架校验与积分发放，避免前端文案与后端判定漂移。
 */

export type JudgeModel = 'M0' | 'M1' | 'M2'

export interface AssessmentTypeDef {
  typeKey: string
  name: string
  fullName: string
  icon: string
  judgeModel: JudgeModel
  version: 'v1.0' | 'v1.1+'
  defaultSubtitle: string
  questionNum: number
  durationDesc: string
}

/** 类型库（4.1.1 内外双线十型，v1.0 上线 3 型） */
export const ASSESSMENT_TYPE_REGISTRY: Record<string, AssessmentTypeDef> = {
  archetype: {
    typeKey: 'archetype',
    name: '心智原型',
    fullName: '周易心智原型测评',
    icon: '☰',
    judgeModel: 'M1',
    version: 'v1.0',
    defaultSubtitle: '八分钟，测出你的本命卦象',
    questionNum: 8,
    durationDesc: '3 分钟'
  },
  emotion: {
    typeKey: 'emotion',
    name: '情绪能量',
    fullName: '情绪能量测评',
    icon: '🌊',
    judgeModel: 'M2',
    version: 'v1.0',
    defaultSubtitle: '读懂此刻的四维能量潮汐',
    questionNum: 5,
    durationDesc: '2 分钟'
  },
  quick_daily: {
    typeKey: 'quick_daily',
    name: '每日打卡',
    fullName: '每日心智打卡',
    icon: '🌙',
    judgeModel: 'M0',
    version: 'v1.0',
    defaultSubtitle: '一题一签，问星今日指引',
    questionNum: 1,
    durationDesc: '1 分钟'
  },
  cognition: {
    typeKey: 'cognition',
    name: '认知风格',
    fullName: '认知风格测评',
    icon: '☲',
    judgeModel: 'M1',
    version: 'v1.1+',
    defaultSubtitle: '你的思维属于哪一卦',
    questionNum: 10,
    durationDesc: '4 分钟'
  },
  decision: {
    typeKey: 'decision',
    name: '决策倾向',
    fullName: '决策倾向测评',
    icon: '☳',
    judgeModel: 'M1',
    version: 'v1.1+',
    defaultSubtitle: '临事而断，观你的抉择之卦',
    questionNum: 10,
    durationDesc: '4 分钟'
  },
  learning: {
    typeKey: 'learning',
    name: '学习方式',
    fullName: '学习方式测评',
    icon: '☴',
    judgeModel: 'M1',
    version: 'v1.1+',
    defaultSubtitle: '解锁你的进卦之道',
    questionNum: 12,
    durationDesc: '5 分钟'
  },
  team: {
    typeKey: 'team',
    name: '团队角色',
    fullName: '团队角色测评',
    icon: '☳',
    judgeModel: 'M1',
    version: 'v1.1+',
    defaultSubtitle: '在你的星宿里，你执什么旗',
    questionNum: 15,
    durationDesc: '6 分钟'
  },
  relationship: {
    typeKey: 'relationship',
    name: '关系模式',
    fullName: '关系模式测评',
    icon: '☱',
    judgeModel: 'M2',
    version: 'v1.1+',
    defaultSubtitle: '看见你在关系里的潮汐',
    questionNum: 12,
    durationDesc: '5 分钟'
  },
  motivation: {
    typeKey: 'motivation',
    name: '动机驱动',
    fullName: '动机驱动测评',
    icon: '☲',
    judgeModel: 'M2',
    version: 'v1.1+',
    defaultSubtitle: '什么在点亮你的引擎',
    questionNum: 12,
    durationDesc: '5 分钟'
  },
  stress: {
    typeKey: 'stress',
    name: '压力应对',
    fullName: '压力应对测评',
    icon: '☵',
    judgeModel: 'M0',
    version: 'v1.1+',
    defaultSubtitle: '面对风浪，你的应对段位',
    questionNum: 8,
    durationDesc: '3 分钟'
  }
}

/** M0 每日一签等级映射 */
export const M0_GRADE_MAP: Array<{
  min: number
  label: string
  title: string
  color: string
  summary: string
}> = [
  {
    min: 80,
    label: '上上签',
    title: '如日中天',
    color: '#f6dfa2',
    summary:
      '今日星光为你加冕——直觉锐利、行动顺遂，宜决断大事、开启新篇。保持这份笃定，让冲劲落在最重要的事上。'
  },
  {
    min: 60,
    label: '中上签',
    title: '渐入佳境',
    color: '#ffd08a',
    summary:
      '天时渐暖，稳中有升。把节奏握在自己手里，不急着摊牌——今天适合打磨细节，为明日的跃升蓄力。'
  },
  {
    min: 40,
    label: '中平签',
    title: '静水流深',
    color: '#9fb4ff',
    summary:
      '无风无浪，正是养心的好日子。少一分对结果的执念，多一分对过程的觉知；重要的不是跑多快，而是不掉队。'
  },
  {
    min: 20,
    label: '中下签',
    title: '云遮月明',
    color: '#a08cf0',
    summary:
      '雾里看花，难免心浮。今天不妨慢半拍：不做大决定、不接烫手山芋，把情绪先安顿好，星光自会重新露头。'
  },
  {
    min: 0,
    label: '下签',
    title: '蛰伏养气',
    color: '#6fd7c0',
    summary:
      '星轨低回，诸事缓行。允许自己「什么都不做」一会儿——低谷不是惩罚，是宇宙在提醒你：先照顾好自己。'
  }
]

/** M1 周易心智原型：八型定义（维度条最高分者胜出） */
export const M1_DIMENSIONS: Array<{
  key: string
  name: string
  symbol: string
  description: string
  archetypeTitle: string
  archetypeSummary: string
  bright: string[]
  blind: string[]
  advice: string
}> = [
  {
    key: 'qian',
    name: '乾天',
    symbol: '☰',
    description: '自强不息的开创之象',
    archetypeTitle: '你是「开拓者·乾」',
    archetypeSummary:
      '雷厉风行的开创者。你天生带着一股向上的冲劲，认准的事九头牛拉不回；在别人还在权衡利弊时，你已经在路上了。留心：锋芒毕露时，也给别人留一点发亮的空间。',
    bright: ['目标感强，决断快速', '自驱力充沛，少内耗', '困难中反而状态上升'],
    blind: ['过刚易折，习惯硬扛', '倾听不足，慢即焦躁', '开口求助对你很难'],
    advice: '健行的马也要学会在草场慢慢走——进一寸，也歇一寸。'
  },
  {
    key: 'dui',
    name: '兑泽',
    symbol: '☱',
    description: '悦言利他的沟通之象',
    archetypeTitle: '你是「沟通者·兑」',
    archetypeSummary:
      '天生的氛围担当与共情者。你能把话说进人心里，也擅长让资源在人之间流动；团队里最亮的黏合剂就是你。留心：照顾所有人之前，先问问自己今天累不累。',
    bright: ['天生共情，说话入心', '氛围担当，贵人缘旺', '资源在你手里会流动'],
    blind: ['讨好倾向，委屈自己', '情绪劳动容易透支', '界限感常被热情冲淡'],
    advice: '照顾所有人之前，先把自己排进名单第一位。'
  },
  {
    key: 'li',
    name: '离火',
    symbol: '☲',
    description: '明丽热情的感染之象',
    archetypeTitle: '你是「燃点者·离」',
    archetypeSummary:
      '自带热度的燃点者。你对热爱之事全情投入，感染力极强，能把一场平淡的讨论烧成共创的火焰。留心：火焰需要氧气，记得给自己留一段独处充电的暗房时间。',
    bright: ['热爱即燃料，全情投入', '感染力强，自带发光体质', '平淡场面也能被你点燃'],
    blind: ['热度来得快去得也快', '输出过度，电量不知不足', '情绪起伏时容易烧穿理性'],
    advice: '火焰需要氧气——定期给自己留一段独处充电的暗房时间。'
  },
  {
    key: 'zhen',
    name: '震雷',
    symbol: '☳',
    description: '行动果决的破局之象',
    archetypeTitle: '你是「破局者·震」',
    archetypeSummary:
      '一遇风口就出手的行动派。你对时机的嗅觉极敏锐，善于在混沌中劈出第一条路。留心：雷声大也要雨点匀，把节奏感练稳，你会走得更远。',
    bright: ['时机嗅觉敏锐，出手快', '混沌之中敢劈第一条路', '行动力是你最大的筹码'],
    blind: ['起头迅猛，收尾容易失速', '三分钟热度的风险', '音量大时盖住了深思'],
    advice: '雷声大也要雨点匀——把节奏感练稳，你会走得更远。'
  },
  {
    key: 'xun',
    name: '巽风',
    symbol: '☴',
    description: '顺势而行的渗透之象',
    archetypeTitle: '你是「顺势者·巽」',
    archetypeSummary:
      '无孔不入的洞察者。你善于借势，重视氛围和关系的暗流，常常不声不响就把事情推到了关键处。留心：顺势不等于回避，重要立场要敢于说出口。',
    bright: ['洞察细腻，无孔不入', '借势高手，四两拨千斤', '关系暗流里的天然导航'],
    blind: ['顺势过头，变成回避', '太在意气氛而压住心声', '重要立场不敢说出口'],
    advice: '顺势是智慧，亮立场是勇气——重要的事，敢于把话说明白。'
  },
  {
    key: 'kan',
    name: '坎水',
    symbol: '☵',
    description: '历险不惧的深思之象',
    archetypeTitle: '你是「深思者·坎」',
    archetypeSummary:
      '越是深水区越冷静的思考者。你处理复杂和危机的能力远超常人，笑点泪点都藏在心底三尺。留心：别让「再想想」变成口头禅，有些答案要下水才能找到。',
    bright: ['越复杂越冷静，水面无波', '危机时刻的定海神针', '思考的深度常人难及'],
    blind: ['「再想想」变成口头禅', '情绪藏得太深，独扛一切', '想得多，试得少'],
    advice: '有些答案不在岸上，在水里——先迈一步，再做修正。'
  },
  {
    key: 'gen',
    name: '艮山',
    symbol: '☶',
    description: '知止有度的守成之象',
    archetypeTitle: '你是「定盘星·艮」',
    archetypeSummary:
      '团队的定盘星与压舱石。你情绪稳定、说到做到，别人慌的时候你总是那个「没事，有我」。留心：山也要挪一挪，偶尔走出舒适圈，风景会大不同。',
    bright: ['稳如磐石，说到做到', '别人慌时你说「有我」', '节奏感稳，值得托付'],
    blind: ['舒适圈筑得有点厚', '慢热，机会容易手慢', '认定一条路，变通不足'],
    advice: '山也要挪一挪——偶尔走出舒适圈，风景会大不同。'
  },
  {
    key: 'kun',
    name: '坤地',
    symbol: '☷',
    description: '厚德载物的成全之象',
    archetypeTitle: '你是「成全者·坤」',
    archetypeSummary:
      '不动声色的成全者。你愿意把舞台让给值得的人，用超强的耐心和执行力托住整个团队；你的靠谱，是很多人敢冲的理由。留心：成全别人时，别忘了自己也值得被看见。',
    bright: ['托举力强，是全队的地基', '耐心与执行力兼备', '你的靠谱，是他人敢冲的理由'],
    blind: ['习惯把舞台让出去', '被忽视时也不表达', '过度付出，忘了给自己留一份'],
    advice: '成全别人时，别忘了自己也值得被看见。'
  }
]

/** M2 情绪能量：四维定义 */
export const M2_DIMENSIONS: Array<{
  key: string
  name: string
  highText: string
  lowText: string
}> = [
  {
    key: 'calm',
    name: '平静',
    highText: '内核稳定：你正处于难得的松弛带，适合复盘、规划与开展有难度的事。',
    lowText: '水面动荡：先按暂停键，做点不动脑子的小事，把心拉回此时此刻。'
  },
  {
    key: 'joy',
    name: '喜悦',
    highText: '能量回弹：情绪流动通畅，是扩大战果、修复关系的好时机。',
    lowText: '情绪库存偏低：别硬撑活跃，先补一觉、约一顿饭、晒十分钟太阳。'
  },
  {
    key: 'anxiety',
    name: '焦虑',
    highText: '焦虑探头：压力雷达有点吵，试着把大任务拆成三件小事逐个击破。',
    lowText: '波澜不惊：焦虑在线低位运行，做点舒适圈外的尝试也不会失控。'
  },
  {
    key: 'fatigue',
    name: '倦怠',
    highText: '电量告急：需要真正的休息而不是换一种忙碌，睡眠优先级 No.1。',
    lowText: '余量充足：身体在线，可以承接一点长期被搁置的计划。'
  }
]

/** M2 个性化画像标题 */
export const M2_PROFILE_TITLES = [
  '心如止水·晨星独照',
  '潮起潮落·自有节律',
  '云层渐散·光在缝隙',
  '风起于内·星图将明'
]

/** OA 引导兜底（配置缺失时使用） */
export const OA_GUIDE_DEFAULTS = {
  officialName: '易道心智',
  accountType: 0 as 0 | 1 | 2,
  result: {
    title: '关注「易道心智」，解锁完整解读',
    desc: '每面一卦，问心问星——更多心智测评与能量指引，等你开启'
  },
  complete: {
    title: '关注「易道心智」，获取完整解读',
    desc: '回到公众号回复「测评」，即可查看你的完整报告与专属指引'
  },
  posterShareText: '我在问星测出了我的本命心智原型，快来看看你的~',
  plazaPath: '/assessment/list'
}

/** 积分规则码与发放值（4.8.1） */
export const ASSESSMENT_POINTS = {
  ASSESSMENT_COMPLETE: 5,
  ASSESSMENT_POSTER: 5,
  REGISTER_WELCOME: 20
} as const

export type PointsScenario = keyof typeof ASSESSMENT_POINTS

/** 渠道来源白名单（4.4.2 五枚举） */
export const CHANNEL_SOURCES = [
  'article',
  'keyword',
  'welcome',
  'menu',
  'share'
] as const

export type ChannelSource = (typeof CHANNEL_SOURCES)[number]

/** 埋点事件类型白名单（E01–E10） */
export const ASSESSMENT_EVENT_TYPES = [
  'channel_visit',
  'plaza_click',
  'response_complete',
  'register_show',
  'register_success',
  'guide_show',
  'guide_click',
  'share_click',
  'poster_create',
  'follow_scan'
] as const

export type AssessmentEventType = (typeof ASSESSMENT_EVENT_TYPES)[number]

/** 积分幂等键映射：场景 → referenceType */
export const POINTS_REFERENCE_TYPE: Record<PointsScenario, string> = {
  ASSESSMENT_COMPLETE: 'survey_response',
  ASSESSMENT_POSTER: 'assessment_event',
  REGISTER_WELCOME: 'user'
}

export const POINTS_RULE_DESCRIPTION: Record<PointsScenario, string> = {
  ASSESSMENT_COMPLETE: '完成正式测评',
  ASSESSMENT_POSTER: '生成测评分享图',
  REGISTER_WELCOME: '新人注册礼'
}

/** E01 去重窗口（毫秒） */
export const EVENT_DEDUP_WINDOW_MS = 5 * 60 * 1000

/** 单会话每分钟上报上限 */
export const EVENT_RATE_LIMIT_PER_MINUTE = 60
