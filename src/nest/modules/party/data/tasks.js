/**
 * 每日任务定义（任务中心 /api/party/tasks，端点 #19-#21）
 * - 逐字镜像小程序 utils/tasks.js 的 TASKS 常量：key/emoji/title/desc/target/reward 两端必须一致
 * - 进度由客户端真实行为 bump 上报（开一局/翻星愿签/点亮星愿/打完全场），
 *   服务端只做封顶记账与 claim 防重入账；奖励写 party_star_trans 流水
 */

const TASKS = [
  { key: 'open_game', emoji: '🎮', title: '开一局', desc: '发起或加入一场对局', target: 1, reward: 5 },
  { key: 'star_visit', emoji: '🌠', title: '翻开星愿签', desc: '去星光页收下今日星愿签', target: 1, reward: 3 },
  { key: 'like_wish', emoji: '💖', title: '点亮星愿', desc: '在星愿墙送出 3 次「我喜欢」', target: 3, reward: 5 },
  { key: 'finish_game', emoji: '🏁', title: '打完全场', desc: '完整打完一局并进入结算', target: 1, reward: 8 },
]

const TASK_MAP = {}
for (let i = 0; i < TASKS.length; i++) TASK_MAP[TASKS[i].key] = TASKS[i]

module.exports = { TASKS, TASK_MAP }
