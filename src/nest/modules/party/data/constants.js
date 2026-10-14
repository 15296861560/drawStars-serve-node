/**
 * 领域常量：游戏元数据 / 段位 / 徽章 / 主题 / 惩罚文案口径
 * 数据口径见 PRD 4.3 / 4.8 / 4.9 / 4.2
 */

const GAMES = [
  {
    key: 'tod',
    name: '真心话大冒险',
    emoji: '💫',
    oneLine: '轮盘抽签，温柔到心动',
    offline: true,
    tip: '破冰首选',
  },
  {
    key: 'draw',
    name: '你画我猜',
    emoji: '🎨',
    oneLine: '一条线画出灵魂',
    offline: false,
    tip: '实时画布',
  },
  {
    key: 'lady',
    name: '小姐牌',
    emoji: '🎴',
    oneLine: '星愿版小姐牌，越抽越上头',
    offline: true,
    tip: '离线可玩',
  },
  {
    key: 'bluff',
    name: '瞎掰王',
    emoji: '🃏',
    oneLine: '一本正经地胡说八道',
    offline: false,
    tip: '投票揭晓',
  },
  {
    key: 'dice',
    name: '大话骰子',
    emoji: '🎲',
    oneLine: '胆量与算力的夜战',
    offline: false,
    tip: '万能点 1',
  },
]

const GAME_MAP = GAMES.reduce((map, g) => {
  map[g.key] = g
  return map
}, {})

/** 难度分级（PRD 4.3 题目池标签） */
const LEVELS = [
  { key: 'gentle', label: '温柔', desc: '轻松无压力，初次破冰', color: 'mint' },
  { key: 'standard', label: '标准', desc: '一点小八卦小冒险', color: 'gold' },
  { key: 'starry', label: '星光', desc: '深入星愿与真心', color: 'coral' },
]

/** 真心话大冒险玩法 B 主题池（PRD 4.3） */
const TOD_THEMES = ['青春', '暗恋', '深夜', '旅行', '未来', '遗憾', '愿望']

/** 星愿标签（PRD 4.8） */
const WISH_THEMES = ['青春', '暗恋', '旅行', '未来', '遗憾', '愿望', '治愈']

/** 段位系统（PRD 4.9） */
const RANKS = [
  { key: 'newcomer', label: '拾星新人', min: 0, max: 99, emoji: '🌱' },
  { key: 'envoy', label: '星光使者', min: 100, max: 499, emoji: '🌠' },
  { key: 'guardian', label: '星愿守护者', min: 500, max: 1999, emoji: '🌙' },
  { key: 'captain', label: '宇宙队长', min: 2000, max: Infinity, emoji: '🚀' },
]

function rankOf(starVal) {
  return RANKS.find((r) => starVal <= r.max) || RANKS[RANKS.length - 1]
}

/** 成就徽章 v1.0 内置 12 个（PRD 4.9，badge_key ↔ party_badge） */
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

/**
 * 惩罚口径（PRD 4.2 + 8.7）：
 * 默认文案含「喝一杯」聚会语境表述，原样保留；房主/玩家可在创建页或对局中改写，
 * 且运营后台可下发无酒「温和模板」批量替换 —— 本案默认开放改写 + 提供温和模板入口
 */
const PENALTY_DEFAULT = '向左侧邻座喝一杯'
const PENALTY_GENTLE = '唱两句最拿手的歌 / 给右侧伙伴一个拥抱 / 说一句土味情话'

/** 本机演示陪跑用户（无后端时填充房间，命名走星光星球系） */
const BOTS = [
  { id: 'u_bot_1', name: '小鹿', avatarUrl: '' },
  { id: 'u_bot_2', name: '阿澈', avatarUrl: '' },
  { id: 'u_bot_3', name: '桃桃', avatarUrl: '' },
  { id: 'u_bot_4', name: '鲸鱼', avatarUrl: '' },
  { id: 'u_bot_5', name: '野莓', avatarUrl: '' },
  { id: 'u_bot_6', name: '星舟', avatarUrl: '' },
  { id: 'u_bot_7', name: '月眠', avatarUrl: '' },
]

/** 口令字符集（PRD 4.2：6 位，剔除 0/O/1/I） */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(len) {
  let code = ''
  for (let i = 0; i < (len || 6); i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

module.exports = {
  GAMES,
  GAME_MAP,
  LEVELS,
  TOD_THEMES,
  WISH_THEMES,
  RANKS,
  rankOf,
  BADGES,
  PENALTY_DEFAULT,
  PENALTY_GENTLE,
  BOTS,
  CODE_CHARS,
  randomCode,
}
