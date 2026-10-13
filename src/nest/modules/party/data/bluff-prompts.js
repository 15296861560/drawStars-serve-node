/**
 * 瞎掰王命题池（PRD 4.6：命题阶段下发，答案 10–60 字盲答）
 * - bluffDefault：玩家未按时提交时自动填充的默认瞎掰文案（异常处理口径）
 * - botAnswers：本机演示模式陪跑答案（对齐 v1.1 AI 陪跑形态，仅演示）
 */

const BLUFF_PROMPTS = [
  {
    id: 'bluff_1', emoji: '🦊',
    prompt: '如果你变成一只动物，你想变成什么？为什么？',
    bluffDefault: '树懒——好把每个好瞬间都过成慢镜头。',
    botAnswers: [
      '狐狸，聪明还自带眼线。',
      '鲸鱼，深海里的心事没人听得见。',
      '柴犬，笑起来就自带好人缘。',
    ],
  },
  {
    id: 'bluff_2', emoji: '🍜',
    prompt: '如果今晚宵夜只能吃一样，你会为什么放弃原则？',
    bluffDefault: '一碗热汤面，汤都在替我说对不起。',
    botAnswers: [
      '烤串，为它我可以晚睡三小时。',
      '小龙虾，戴手套剥的都是仪式感。',
      '糖炒栗子，冬天是它先开始的。',
    ],
  },
  {
    id: 'bluff_3', emoji: '🪐',
    prompt: '如果能给一年后的自己寄三样东西，你会寄什么？',
    bluffDefault: '一张今晚的合照、一颗松掉的纽扣、一句别熬夜。',
    botAnswers: [
      '本场的口令、日历上圈红的今天、一句稳住。',
      '请假条、坦克毛毯、和今晚的月光。',
      '勇气一把、沉默一段、星星三颗。',
    ],
  },
  {
    id: 'bluff_4', emoji: '🚗',
    prompt: '如果人生是一部公路片，你的副驾必须坐谁？',
    bluffDefault: '坐一个会导航也会说「不急」的人。',
    botAnswers: [
      '我的猫，它睡着的呼噜是白噪音。',
      '最好的朋友，拌嘴都像背景音。',
      '未来的自己，提前看看路况。',
    ],
  },
  {
    id: 'bluff_5', emoji: '🎤',
    prompt: 'KTV 里你总抢不到的那首歌是哪首？为什么是它？',
    bluffDefault: '抢不到的永远是合唱的那首，它需要所有人都在。',
    botAnswers: [
      '《死了都要爱》——高音上去就下不来了。',
      '《突然好想你》——大家一起唱才有味道。',
      '《孤勇者》——被小孩哥承包了。',
    ],
  },
  {
    id: 'bluff_6', emoji: '🐈',
    prompt: '如果宠物会说话，它对你说的第一句话最可能是什么？',
    bluffDefault: '「这个点的猫粮，是晚了吗？」',
    botAnswers: [
      '「铲屎的，加戏可以，加饭更快。」',
      '「你出门的时候，我数了 9 小时 42 分。」',
      '「别拍我屁股，拍正面。」',
    ],
  },
  {
    id: 'bluff_7', emoji: '🏝️',
    prompt: '无人岛求生只能再带一个人，你带谁？说明理由。',
    bluffDefault: '带会用椰子开椰子的人，实用主义也很好看。',
    botAnswers: [
      '带会生火的，夜晚需要篝火和故事。',
      '带最会讲冷笑话的，卡路里靠笑话补。',
      '带会打绳结的，帐篷比浪漫优先。',
    ],
  },
  {
    id: 'bluff_8', emoji: '🎬',
    prompt: '你的人生旁白会请哪个明星配音？为什么？',
    bluffDefault: '要一个声线懒懒的，加班都像在度假。',
    botAnswers: [
      '要低音炮，吵架都显得深情。',
      '要喜剧演员，人生自带罐头笑声。',
      '要纪录片旁白，上班都像看动物世界。',
    ],
  },
  {
    id: 'bluff_9', emoji: '💡',
    prompt: '如果发明一台解决你最大痛点的机器，它叫什么名字？',
    bluffDefault: '「回笼钟」——主打把早八温柔地还给我。',
    botAnswers: [
      '「不敢说出口翻译器」，替我勇敢三秒。',
      '「续杯仪」，万物皆可续。',
      '「排队消失器」——只对本人生效。',
    ],
  },
  {
    id: 'bluff_10', emoji: '⏰',
    prompt: '如果每天多出一小时，你会偷偷用在哪里？',
    bluffDefault: '用来发呆，把白天的自己捡回来。',
    botAnswers: [
      '学一门没用的手艺，比如给云拍照。',
      '把「改天约」真的改成今天。',
      '多陪家人吃一顿不赶时间的饭。',
    ],
  },
  {
    id: 'bluff_11', emoji: '🌠',
    prompt: '流星只在你说出一件事时才亮起，你会说什么？',
    bluffDefault: '我想被你们记住很多年。',
    botAnswers: [
      '希望今晚永远不散场。',
      '把好运匀给没来的那位朋友。',
      '下一次还是我们这群人。',
    ],
  },
  {
    id: 'bluff_12', emoji: '🧋',
    prompt: '你的「本命饮品」暴露了你什么性格？',
    bluffDefault: '三分糖去冰：温柔但有底线。',
    botAnswers: [
      '热美式：成年人的苦要自己选。',
      '多冰全糖：快乐要最响的那种。',
      '热可可：随时准备安慰别人。',
    ],
  },
]

/** 抽一条命题（excludeIds 去重） */
function pickBluffPrompt(excludeIds) {
  const exclude = excludeIds || []
  const fresh = BLUFF_PROMPTS.filter((p) => exclude.indexOf(p.id) === -1)
  const pool = fresh.length ? fresh : BLUFF_PROMPTS
  return pool[Math.floor(Math.random() * pool.length)]
}

module.exports = { BLUFF_PROMPTS, pickBluffPrompt }
