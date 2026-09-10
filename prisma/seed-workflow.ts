/**
 * Workflow business seed: default categories, 17 builtin tools (PRD 4.3.2), official templates (PRD 4.6.3).
 * Idempotent: safe to re-run. Run: pnpm prisma:seed-workflow
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ============================================================
// 1. 默认流程分类（同时作为模板市场分类）
// ============================================================
const CATEGORY_SEEDS = [
  {
    code: 'office',
    name: '办公协同',
    icon: 'OfficeBuilding',
    description: '日报、审批、协同类流程',
    sortOrder: 1
  },
  {
    code: 'data',
    name: '数据处理',
    icon: 'DataAnalysis',
    description: '数据同步、清洗、汇总类流程',
    sortOrder: 2
  },
  {
    code: 'service',
    name: '客户服务',
    icon: 'Service',
    description: '工单、客服、回访类流程',
    sortOrder: 3
  },
  {
    code: 'marketing',
    name: '营销推广',
    icon: 'Promotion',
    description: '活动、触达、积分类流程',
    sortOrder: 4
  },
  {
    code: 'ops',
    name: '运维监控',
    icon: 'Monitor',
    description: '巡检、告警、值班类流程',
    sortOrder: 5
  },
  {
    code: 'ai',
    name: 'AI 应用',
    icon: 'MagicStick',
    description: '内容生成、审核、分析类流程',
    sortOrder: 6
  }
]

// ============================================================
// 2. 内置工具（PRD 4.3.2：17 个，isBuiltin = true）
//    paramSchema/outputSchema 采用 { 字段: 类型 } 简化结构
// ============================================================
type ToolSeed = {
  name: string
  code: string
  category: string
  description: string
  icon: string
  endpoint?: string
  method: string
  authConfig?: Record<string, unknown>
  paramSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

const TOOL_SEEDS: ToolSeed[] = [
  // ---- 消息通知（3）----
  {
    name: '飞书消息发送',
    code: 'feishu_message',
    category: 'NOTIFICATION',
    description: '发送文本/卡片消息到指定群聊',
    icon: 'ChatDotRound',
    endpoint: '/api/v1/tools/feishu/message',
    method: 'POST',
    authConfig: { type: 'bearer' },
    paramSchema: {
      chat_id: 'string',
      msg_type: 'string',
      content: 'string'
    },
    outputSchema: { message_id: 'string' }
  },
  {
    name: '邮件发送',
    code: 'email_send',
    category: 'NOTIFICATION',
    description: 'SMTP 邮件发送',
    icon: 'Message',
    endpoint: '/api/v1/tools/email/send',
    method: 'POST',
    paramSchema: {
      to: 'string',
      subject: 'string',
      body: 'string',
      cc: 'string'
    },
    outputSchema: { message_id: 'string' }
  },
  {
    name: '钉钉消息',
    code: 'dingtalk_message',
    category: 'NOTIFICATION',
    description: '钉钉机器人推送',
    icon: 'Bell',
    endpoint: '/api/v1/tools/dingtalk/message',
    method: 'POST',
    paramSchema: {
      webhook: 'string',
      content: 'string',
      at_all: 'boolean'
    },
    outputSchema: { errcode: 'number' }
  },
  // ---- 数据操作（3）----
  {
    name: 'HTTP 请求',
    code: 'http_request',
    category: 'DATA',
    description: '通用 HTTP 调用',
    icon: 'Link',
    method: 'GET',
    paramSchema: {
      url: 'string',
      method: 'string',
      headers: 'object',
      body: 'object'
    },
    outputSchema: {
      status: 'number',
      data: 'object'
    }
  },
  {
    name: '数据库查询',
    code: 'db_query',
    category: 'DATA',
    description: 'SQL 查询执行',
    icon: 'Coin',
    endpoint: '/api/v1/tools/db/query',
    method: 'POST',
    authConfig: { type: 'bearer' },
    paramSchema: {
      datasource: 'string',
      sql: 'string',
      params: 'object'
    },
    outputSchema: {
      rows: 'array',
      total: 'number'
    }
  },
  {
    name: 'Redis 操作',
    code: 'redis_op',
    category: 'DATA',
    description: '缓存读写',
    icon: 'Timer',
    endpoint: '/api/v1/tools/redis/exec',
    method: 'POST',
    paramSchema: {
      command: 'string',
      key: 'string',
      value: 'string',
      ttl: 'number'
    },
    outputSchema: { result: 'string' }
  },
  // ---- 文件处理（2）----
  {
    name: '文件上传',
    code: 'file_upload',
    category: 'FILE',
    description: '上传到 OSS/本地',
    icon: 'Upload',
    endpoint: '/api/v1/tools/file/upload',
    method: 'POST',
    paramSchema: {
      file_url: 'string',
      target: 'string',
      path: 'string'
    },
    outputSchema: {
      file_id: 'string',
      url: 'string'
    }
  },
  {
    name: '文件下载',
    code: 'file_download',
    category: 'FILE',
    description: '下载远程文件',
    icon: 'Download',
    method: 'GET',
    paramSchema: {
      url: 'string',
      save_path: 'string'
    },
    outputSchema: {
      file_path: 'string',
      size: 'number'
    }
  },
  // ---- AI 能力（6）----
  {
    name: '文本摘要',
    code: 'text_summary',
    category: 'AI',
    description: '调用 AI 生成摘要',
    icon: 'Document',
    endpoint: '/api/v1/tools/ai/summary',
    method: 'POST',
    paramSchema: {
      text: 'string',
      max_length: 'number',
      language: 'string'
    },
    outputSchema: { summary: 'string' }
  },
  {
    name: '文本翻译',
    code: 'text_translate',
    category: 'AI',
    description: '多语言翻译',
    icon: 'Position',
    endpoint: '/api/v1/tools/ai/translate',
    method: 'POST',
    paramSchema: {
      text: 'string',
      source_lang: 'string',
      target_lang: 'string'
    },
    outputSchema: { translated: 'string' }
  },
  {
    name: '图片识别',
    code: 'image_recognition',
    category: 'AI',
    description: '图片内容识别',
    icon: 'Picture',
    endpoint: '/api/v1/tools/ai/image',
    method: 'POST',
    paramSchema: {
      image_url: 'string',
      tasks: 'array'
    },
    outputSchema: {
      labels: 'array',
      ocr_text: 'string'
    }
  },
  {
    name: '情感分析',
    code: 'sentiment_analysis',
    category: 'AI',
    description: '文本情感倾向分析',
    icon: 'Sunny',
    endpoint: '/api/v1/tools/ai/sentiment',
    method: 'POST',
    paramSchema: { text: 'string' },
    outputSchema: {
      sentiment: 'string',
      score: 'number'
    }
  },
  {
    name: '关键词提取',
    code: 'keyword_extract',
    category: 'AI',
    description: '从文本中提取关键词',
    icon: 'Key',
    endpoint: '/api/v1/tools/ai/keywords',
    method: 'POST',
    paramSchema: {
      text: 'string',
      top_k: 'number'
    },
    outputSchema: { keywords: 'array' }
  },
  {
    name: '内容分类',
    code: 'content_classify',
    category: 'AI',
    description: '文本自动分类',
    icon: 'CollectionTag',
    endpoint: '/api/v1/tools/ai/classify',
    method: 'POST',
    paramSchema: {
      text: 'string',
      categories: 'array'
    },
    outputSchema: {
      category: 'string',
      confidence: 'number'
    }
  },
  // ---- 平台能力（3）----
  {
    name: '积分发放',
    code: 'points_grant',
    category: 'PLATFORM',
    description: '对接积分系统',
    icon: 'Present',
    endpoint: '/api/v1/points/grant',
    method: 'POST',
    authConfig: { type: 'bearer' },
    paramSchema: {
      user_id: 'string',
      points: 'number',
      reason: 'string'
    },
    outputSchema: { balance: 'number' }
  },
  {
    name: '任务创建',
    code: 'task_create',
    category: 'PLATFORM',
    description: '对接任务系统',
    icon: 'Tickets',
    endpoint: '/api/v1/task/create',
    method: 'POST',
    paramSchema: {
      title: 'string',
      assignee_id: 'string',
      due_date: 'string',
      priority: 'string'
    },
    outputSchema: { task_id: 'string' }
  },
  {
    name: '用户查询',
    code: 'user_query',
    category: 'PLATFORM',
    description: '查询用户信息',
    icon: 'User',
    endpoint: '/api/v1/user/info',
    method: 'GET',
    paramSchema: {
      user_id: 'string',
      keyword: 'string'
    },
    outputSchema: {
      user_id: 'string',
      nickname: 'string',
      level: 'number'
    }
  }
]

// ============================================================
// 3. 官方模板（PRD 4.6.3，isOfficial = true）
//    graphData 结构与前端 designer 完全一致
// ============================================================
const AGENT_DEFAULT = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
  timeout: 120,
  retryTimes: 3,
  retryInterval: 5,
  failStrategy: 'ABORT'
}

const TEMPLATE_SEEDS = [
  {
    name: '每日数据汇总日报',
    description:
      '定时查询业务数据并汇总为日报，通过飞书群机器人推送。适合运营每日数据播报场景。',
    icon: 'DataAnalysis',
    category: 'data',
    installCount: 128,
    rating: 4.6,
    graphData: {
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          name: '定时触发',
          position: { x: 60, y: 200 },
          config: {
            triggerType: 'CRON',
            cron: '0 9 * * *',
            timezone: 'Asia/Shanghai'
          }
        },
        {
          id: 'node_query',
          type: 'TOOL',
          name: '查询昨日数据',
          position: { x: 340, y: 200 },
          config: {
            toolId: 'db_query',
            paramMapping: {
              datasource: 'default',
              sql: "SELECT COUNT(*) AS total FROM business_log WHERE created_at >= '{{trigger.date}} 00:00:00'"
            },
            timeout: 30,
            retryTimes: 3,
            retryInterval: 5,
            failStrategy: 'ABORT'
          }
        },
        {
          id: 'node_transform',
          type: 'TRANSFORM',
          name: '组装日报',
          position: { x: 620, y: 200 },
          config: {
            transformType: 'MAPPING',
            mapping: {
              date: '{{trigger.date}}',
              total: '{{node_query.output.rows[0].total}}'
            }
          }
        },
        {
          id: 'node_output',
          type: 'OUTPUT',
          name: '发送日报',
          position: { x: 900, y: 200 },
          config: {
            outputType: 'NOTIFY',
            template:
              '【每日日报】{{node_transform.output.date}}\n业务总量：{{node_transform.output.total}}'
          }
        }
      ],
      edges: [
        { id: 'edge_1', source: 'node_trigger', target: 'node_query' },
        { id: 'edge_2', source: 'node_query', target: 'node_transform' },
        { id: 'edge_3', source: 'node_transform', target: 'node_output' }
      ]
    },
    globalConfig: { timeout: 300, retryTimes: 3, retryInterval: 5 }
  },
  {
    name: '智能工单分类路由',
    description:
      '新工单创建后由 AI 识别意图并自动分类，高置信度直接派发，低置信度转人工处理。',
    icon: 'Service',
    category: 'service',
    installCount: 96,
    rating: 4.4,
    graphData: {
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          name: '工单创建事件',
          position: { x: 60, y: 200 },
          config: {
            triggerType: 'EVENT',
            eventType: 'ticket.created',
            queueUrl: ''
          }
        },
        {
          id: 'node_agent',
          type: 'AGENT',
          name: 'AI 意图识别',
          position: { x: 340, y: 200 },
          config: {
            ...AGENT_DEFAULT,
            systemPrompt:
              '你是客服工单分类助手。根据工单内容判断类别（咨询/投诉/售后/建议），并给出 0-1 的置信度。'
          }
        },
        {
          id: 'node_condition',
          type: 'CONDITION',
          name: '置信度判断',
          position: { x: 620, y: 200 },
          config: {
            expression: '{{node_agent.output.confidence}} >= 0.8',
            branches: [
              { name: '自动派发', condition: '>= 0.8' },
              { name: '转人工', condition: 'otherwise' }
            ]
          }
        },
        {
          id: 'node_output',
          type: 'OUTPUT',
          name: '通知处理人',
          position: { x: 900, y: 200 },
          config: {
            outputType: 'NOTIFY',
            template:
              '工单 {{node_trigger.body.ticket_id}} 已分类为 {{node_agent.output.category}}，请及时处理。'
          }
        }
      ],
      edges: [
        { id: 'edge_1', source: 'node_trigger', target: 'node_agent' },
        { id: 'edge_2', source: 'node_agent', target: 'node_condition' },
        {
          id: 'edge_3',
          source: 'node_condition',
          target: 'node_output',
          label: '自动派发'
        }
      ]
    },
    globalConfig: { timeout: 300, retryTimes: 3, retryInterval: 5 }
  },
  {
    name: '营销积分自动发放',
    description:
      '手动触发批量查询目标用户，高级会员自动发放活动积分，并通过站内信通知用户。',
    icon: 'Present',
    category: 'marketing',
    installCount: 75,
    rating: 4.2,
    graphData: {
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          name: '手动触发',
          position: { x: 60, y: 200 },
          config: { triggerType: 'MANUAL' }
        },
        {
          id: 'node_user',
          type: 'TOOL',
          name: '查询用户信息',
          position: { x: 340, y: 200 },
          config: {
            toolId: 'user_query',
            paramMapping: { user_id: '{{trigger.body.user_id}}' },
            timeout: 30,
            retryTimes: 3,
            retryInterval: 5,
            failStrategy: 'SKIP'
          }
        },
        {
          id: 'node_condition',
          type: 'CONDITION',
          name: '会员等级判断',
          position: { x: 620, y: 200 },
          config: {
            expression: '{{node_user.output.level}} >= 2',
            branches: [
              { name: '高级会员', condition: '>= 2' },
              { name: '普通用户', condition: 'otherwise' }
            ]
          }
        },
        {
          id: 'node_grant',
          type: 'TOOL',
          name: '发放积分',
          position: { x: 900, y: 200 },
          config: {
            toolId: 'points_grant',
            paramMapping: {
              user_id: '{{node_user.output.user_id}}',
              points: 100,
              reason: '营销活动奖励'
            },
            timeout: 30,
            retryTimes: 3,
            retryInterval: 5,
            failStrategy: 'ABORT'
          }
        },
        {
          id: 'node_output',
          type: 'OUTPUT',
          name: '通知用户',
          position: { x: 1180, y: 200 },
          config: {
            outputType: 'NOTIFY',
            template: '您已获得 100 积分营销活动奖励，请注意查收。'
          }
        }
      ],
      edges: [
        { id: 'edge_1', source: 'node_trigger', target: 'node_user' },
        { id: 'edge_2', source: 'node_user', target: 'node_condition' },
        {
          id: 'edge_3',
          source: 'node_condition',
          target: 'node_grant',
          label: '高级会员'
        },
        { id: 'edge_4', source: 'node_grant', target: 'node_output' }
      ]
    },
    globalConfig: { timeout: 600, retryTimes: 3, retryInterval: 5 }
  },
  {
    name: 'AI 内容审核告警',
    description:
      '用户提交内容后由 AI 自动审核，命中违规关键词或高风险内容时立即通知管理员处理。',
    icon: 'Warning',
    category: 'ai',
    installCount: 64,
    rating: 4.5,
    graphData: {
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          name: '内容提交事件',
          position: { x: 60, y: 200 },
          config: {
            triggerType: 'EVENT',
            eventType: 'content.submitted',
            queueUrl: ''
          }
        },
        {
          id: 'node_agent',
          type: 'AGENT',
          name: 'AI 内容审核',
          position: { x: 340, y: 200 },
          config: {
            ...AGENT_DEFAULT,
            temperature: 0.2,
            systemPrompt:
              '你是内容安全审核员。判断文本是否包含违规内容（色情/暴力/广告/敏感政治），输出 risk_level（low/medium/high）与违规原因。'
          }
        },
        {
          id: 'node_condition',
          type: 'CONDITION',
          name: '风险等级判断',
          position: { x: 620, y: 200 },
          config: {
            expression: '{{node_agent.output.risk_level}} == high',
            branches: [
              { name: '高风险', condition: 'high' },
              { name: '正常', condition: 'otherwise' }
            ]
          }
        },
        {
          id: 'node_output',
          type: 'OUTPUT',
          name: '告警通知',
          position: { x: 900, y: 200 },
          config: {
            outputType: 'NOTIFY',
            template:
              '【内容审核告警】内容 {{node_trigger.body.content_id}} 命中高风险：{{node_agent.output.reason}}，请立即处理。'
          }
        }
      ],
      edges: [
        { id: 'edge_1', source: 'node_trigger', target: 'node_agent' },
        { id: 'edge_2', source: 'node_agent', target: 'node_condition' },
        {
          id: 'edge_3',
          source: 'node_condition',
          target: 'node_output',
          label: '高风险'
        }
      ]
    },
    globalConfig: { timeout: 300, retryTimes: 3, retryInterval: 5 }
  },
  {
    name: '定时服务巡检',
    description:
      '周期性探测核心服务接口可用性，异常状态码触发告警通知值班人员，适合轻量可用性监控。',
    icon: 'Monitor',
    category: 'ops',
    installCount: 87,
    rating: 4.3,
    graphData: {
      nodes: [
        {
          id: 'node_trigger',
          type: 'TRIGGER',
          name: '定时触发',
          position: { x: 60, y: 200 },
          config: {
            triggerType: 'CRON',
            cron: '*/5 * * * *',
            timezone: 'Asia/Shanghai'
          }
        },
        {
          id: 'node_http',
          type: 'TOOL',
          name: '健康检查',
          position: { x: 340, y: 200 },
          config: {
            toolId: 'http_request',
            paramMapping: {
              url: 'https://api.example.com/healthz',
              method: 'GET'
            },
            timeout: 30,
            retryTimes: 3,
            retryInterval: 5,
            failStrategy: 'SKIP'
          }
        },
        {
          id: 'node_condition',
          type: 'CONDITION',
          name: '状态判断',
          position: { x: 620, y: 200 },
          config: {
            expression: '{{node_http.output.status}} != 200',
            branches: [
              { name: '服务异常', condition: '!= 200' },
              { name: '正常', condition: 'otherwise' }
            ]
          }
        },
        {
          id: 'node_output',
          type: 'OUTPUT',
          name: '告警通知',
          position: { x: 900, y: 200 },
          config: {
            outputType: 'NOTIFY',
            template:
              '【巡检告警】健康检查接口返回 {{node_http.output.status}}，请值班同学关注。'
          }
        }
      ],
      edges: [
        { id: 'edge_1', source: 'node_trigger', target: 'node_http' },
        { id: 'edge_2', source: 'node_http', target: 'node_condition' },
        {
          id: 'edge_3',
          source: 'node_condition',
          target: 'node_output',
          label: '服务异常'
        }
      ]
    },
    globalConfig: { timeout: 300, retryTimes: 3, retryInterval: 5 }
  }
]

// ============================================================
// Seed 实现
// ============================================================
async function upsertCategories() {
  let count = 0
  for (const c of CATEGORY_SEEDS) {
    await prisma.workflowCategory.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        icon: c.icon,
        description: c.description,
        sortOrder: c.sortOrder,
        enabled: true
      },
      update: {
        name: c.name,
        icon: c.icon,
        description: c.description,
        sortOrder: c.sortOrder,
        enabled: true
      }
    })
    count++
  }
  return count
}

async function upsertTools() {
  let count = 0
  for (const t of TOOL_SEEDS) {
    const data = {
      name: t.name,
      category: t.category,
      description: t.description,
      icon: t.icon,
      endpoint: t.endpoint ?? null,
      method: t.method,
      authConfig: (t.authConfig ?? null) as any,
      paramSchema: t.paramSchema as any,
      outputSchema: (t.outputSchema ?? null) as any,
      isBuiltin: true,
      enabled: true
    }
    await prisma.workflowTool.upsert({
      where: { code: t.code },
      create: { code: t.code, ...data },
      update: data
    })
    count++
  }
  return count
}

async function upsertTemplates() {
  let count = 0
  for (const tpl of TEMPLATE_SEEDS) {
    // 模板表无唯一键，按 官方 + 同名 定位，保证幂等
    const existing = await prisma.workflowTemplate.findFirst({
      where: { name: tpl.name, isOfficial: true }
    })
    const data = {
      name: tpl.name,
      description: tpl.description,
      icon: tpl.icon,
      category: tpl.category,
      graphData: tpl.graphData as any,
      globalConfig: tpl.globalConfig as any,
      isOfficial: true,
      installCount: tpl.installCount,
      rating: tpl.rating,
      enabled: true
    }
    if (existing) {
      await prisma.workflowTemplate.update({
        where: { id: existing.id },
        data
      })
    } else {
      await prisma.workflowTemplate.create({ data })
    }
    count++
  }
  return count
}

async function main() {
  console.log('[seed-workflow] start')
  const categories = await upsertCategories()
  const tools = await upsertTools()
  const templates = await upsertTemplates()
  console.log('[seed-workflow] done', {
    categories,
    builtinTools: tools,
    officialTemplates: templates
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
