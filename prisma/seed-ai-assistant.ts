/**
 * AI 数据问数数据集注册表 seed（PRD 5.5）：5 个数据集的表结构数据字典、
 * 前置业务权限码、表白名单与敏感字段。幂等 upsert（code 为主键）。
 * Run: pnpm prisma:seed-ai-assistant
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type DatasetSeed = {
  code: string
  label: string
  /** NL2SQL 可引用的表白名单（JOIN 双表均须在此） */
  allowedTables: string[]
  /** 第二层前置业务权限码（须与 seed-rbac 菜单 permission 一致） */
  requiredPermission: string
  /** 除全局基线（password/token/secret/phone/email）外追加拦截的字段 */
  sensitiveFields: string[]
  /** 供 LLM 路由与 NL2SQL 使用的表结构数据字典 */
  description: string
}

const DATASET_SEEDS: DatasetSeed[] = [
  {
    code: 'points',
    label: '积分数据',
    allowedTables: ['points_transaction', 'points_account', 'points_rule'],
    requiredPermission: 'system:points:list',
    sensitiveFields: [],
    description: [
      '表 points_transaction（积分交易流水）：id, transaction_no, user_id, account_id, type（收入/支出类型）, points（变动分值，正数收入/负数支出）, balance_before, balance_after, source（积分来源：SIGN_IN 签到 / TASK 任务 / WORKFLOW 流程 / ACTIVITY 活动等）, description（说明）, status（COMPLETED）, created_at（DATETIME 发放时间）。',
      '表 points_account（积分账户）：id, user_id, points_type（积分类型）, available_points（可用分）, frozen_points（冻结分）, total_earned（累计获得）, total_spent（累计消耗）, level（等级数字）, level_name（等级名）, status, created_at, updated_at。'
    ].join('\n')
  },
  {
    code: 'workflow',
    label: '流程编排数据',
    allowedTables: ['workflow', 'workflow_execution'],
    requiredPermission: 'system:workflow:list',
    sensitiveFields: [],
    description: [
      '表 workflow（流程定义）：id, workflow_no（流程编号）, name（流程名称）, category_id, status（DRAFT/PENDING/PUBLISHED/REJECTED/PAUSED/OFFLINE）, creator_id（创建人）, created_at, deleted_at（软删除标记，非 NULL 为已删除）。',
      '表 workflow_execution（流程执行实例）：id, execution_no（执行单号）, workflow_id（关联 workflow.id，可 JOIN）, workflow_version, status（PENDING/RUNNING/SUCCEEDED/FAILED/TIMEOUT/CANCELLED/PAUSED）, trigger_type（CRON/WEBHOOK/MANUAL/EVENT）, duration_ms（耗时毫秒）, started_at, finished_at, created_at。',
      '统计流转次数/平均耗时用 workflow_execution；按流程名分组需 JOIN workflow（关联键 workflow_execution.workflow_id = workflow.id）。'
    ].join('\n')
  },
  {
    code: 'tasks',
    label: '任务数据',
    allowedTables: ['task_def', 'task_instance'],
    requiredPermission: 'system:task:list',
    sensitiveFields: [],
    description: [
      '表 task_def（任务定义）：id, task_no（任务编号）, title（任务名称）, category_id, task_type（任务类型）, difficulty（难度）, status（任务状态）, target_count（目标次数）, created_by, created_at。',
      '表 task_instance（用户任务实例）：id, task_id（关联 task_def.id，可 JOIN）, user_id, status（IN_PROGRESS 进行中 / COMPLETED 已完成 / 其他状态码）, current_count（当前进度）, target_count（目标次数）, reward_claimed（1=奖励已领取）, accepted_at（领取时间）, completed_at（完成时间）, expired_at, created_at。',
      '完成率 = status = "COMPLETED" 的实例数 / 总实例数；按任务分组需 JOIN task_def（关联键 task_instance.task_id = task_def.id）。'
    ].join('\n')
  },
  {
    code: 'survey',
    label: '问卷数据',
    allowedTables: ['survey', 'survey_response'],
    requiredPermission: 'survey:questionnaire:list',
    sensitiveFields: ['ip', 'deviceFingerprint', 'accessPassword'],
    description: [
      '表 survey（问卷）：id, title（问卷标题）, type, status（draft 草稿 / published 已发布 / 其他状态码）, creator_id（创建人）, created_at, deleted_at（软删除标记，非 NULL 为已删除）。',
      '表 survey_response（回收记录）：id, survey_id（关联 survey.id，可 JOIN）, user_id, status, is_valid（1=有效问卷）, duration（作答时长秒）, submitted_at（提交时间）, created_at。',
      '回收率 = 有效回收数（survey_response.is_valid = 1）/ 发放量；发放量需结合业务口径，本表只存实际作答记录，统计回收数时按 survey_id 分组并 JOIN survey。'
    ].join('\n')
  },
  {
    code: 'logs',
    label: '操作日志',
    allowedTables: ['log'],
    requiredPermission: 'system:logs:list',
    sensitiveFields: [],
    description: [
      '表 log（系统操作日志）：log_id（主键）, log_type（日志类型）, content（日志内容文本）, hostname（主机名）, original_url（来源接口）, createTime（注意：列为驼峰 createTime，BIGINT 毫秒时间戳，非 DATETIME！）。',
      '时间过滤/展示必须显式转换：FROM_UNIXTIME(createTime / 1000) 得到 DATETIME；例如最近 24 小时用 WHERE FROM_UNIXTIME(createTime / 1000) >= NOW() - INTERVAL 24 HOUR，输出列用 FROM_UNIXTIME(createTime / 1000) AS 时间。'
    ].join('\n')
  }
]

async function main() {
  console.log('[seed-ai-assistant] start')
  for (const ds of DATASET_SEEDS) {
    await prisma.aiDatasetRegistry.upsert({
      where: { code: ds.code },
      create: {
        code: ds.code,
        label: ds.label,
        allowedTables: ds.allowedTables,
        requiredPermission: ds.requiredPermission,
        sensitiveFields: ds.sensitiveFields,
        enabled: true,
        description: ds.description
      },
      update: {
        label: ds.label,
        allowedTables: ds.allowedTables,
        requiredPermission: ds.requiredPermission,
        sensitiveFields: ds.sensitiveFields,
        enabled: true,
        description: ds.description
      }
    })
    console.log(`[seed-ai-assistant] upsert dataset: ${ds.code} -> ${ds.requiredPermission}`)
  }
  const total = await prisma.aiDatasetRegistry.count()
  console.log('[seed-ai-assistant] done', { datasets: total })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
