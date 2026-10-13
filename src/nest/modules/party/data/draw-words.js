/**
 * 你画我猜离线词库（PRD 4.4：按主题标签与难度分级）
 * 4 主题 × 3 难度 × 4 词 = 48 词
 */

const DRAW_WORDS = {
  生活日常: {
    easy: ['牙刷', '雨伞', '外卖', '口罩'],
    mid: ['健身环', '快递柜', '手机支架', '闹钟响了'],
    hard: ['社死现场', '云养猫', '夜宵自由', '电子木鱼'],
  },
  自然星野: {
    easy: ['月亮', '彩虹', '萤火虫', '枫叶'],
    mid: ['雪人', '流星雨', '潮汐', '极光'],
    hard: ['银河旋臂', '月食', '海市蜃楼', '猫头鹰邮差'],
  },
  深夜食堂: {
    easy: ['泡面', '烤串', '奶茶', '火锅'],
    mid: ['关东煮', '糖葫芦', '小龙虾', '汉堡'],
    hard: ['深夜忏悔锅', '灵魂烤冷面', '返场辣条', '月光吐司'],
  },
  星夜童话: {
    easy: ['魔法棒', '城堡', '南瓜车', '小飞象'],
    mid: ['美人鱼', '许愿池', '独角兽', '流星许愿'],
    hard: ['星际快递', '银河音乐节', '颠倒星球', '星光发布会'],
  },
}

const DRAW_THEMES = Object.keys(DRAW_WORDS)
const LEVEL_KEYS = ['easy', 'mid', 'hard']

/**
 * 抽一个词
 * @param {Object} opts { themes: string[] 单选或全量, level: 'easy'|'mid'|'hard', exclude: string[] 本场已用 }
 */
function pickDrawWord(opts) {
  const o = opts || {}
  const themes = (o.themes && o.themes.filter((t) => DRAW_WORDS[t])) || DRAW_THEMES
  const level = LEVEL_KEYS.indexOf(o.level) >= 0 ? o.level : LEVEL_KEYS[Math.floor(Math.random() * 3)]
  const theme = themes[Math.floor(Math.random() * themes.length)]
  const pool = (DRAW_WORDS[theme] || {})[level] || []
  const exclude = o.exclude || []
  const fresh = pool.length ? pool.filter((w) => exclude.indexOf(w) === -1) : pool
  const word = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length || 1))]
  return { word, theme, level }
}

/** 随机难度抽词（演示用） */
function randomDrawWord() {
  return pickDrawWord({ level: LEVEL_KEYS[Math.floor(Math.random() * 3)] })
}

module.exports = { DRAW_WORDS, DRAW_THEMES, pickDrawWord, randomDrawWord }
