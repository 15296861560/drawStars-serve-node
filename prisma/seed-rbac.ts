/**
 * Idempotent RBAC seed: roles, menus, role-menu binds, user-role by level.
 * Run: pnpm prisma:seed-rbac
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LEVEL_TO_ROLE: Record<number, string> = {
  1: 'user',
  2: 'advanced',
  9: 'admin',
  99: 'super_admin'
}

type MenuSeed = {
  key: string
  parentKey?: string
  name: string
  type: 1 | 2 | 3
  path?: string
  permission?: string
  icon?: string
  client?: string
  moduleCode?: string
  /** 1 = mobile bottom tab candidate */
  isTab?: 0 | 1
  sort: number
}

const MENU_SEEDS: MenuSeed[] = [
  {
    key: 'home',
    name: '首页',
    type: 2,
    path: '/home/homepage',
    icon: 'HomeFilled',
    sort: 1
  },
  {
    key: 'manage',
    name: '管理中心',
    type: 1,
    path: '/home/manageHomePage',
    icon: 'Setting',
    sort: 10
  },
  {
    key: 'manage_user',
    parentKey: 'manage',
    name: '用户管理',
    type: 2,
    path: '/home/manageHomePage/user',
    permission: 'system:user:list',
    icon: 'UserFilled',
    sort: 1
  },
  {
    key: 'manage_user_create',
    parentKey: 'manage_user',
    name: '新增用户',
    type: 3,
    permission: 'system:user:create',
    sort: 1
  },
  {
    key: 'manage_user_update',
    parentKey: 'manage_user',
    name: '编辑用户',
    type: 3,
    permission: 'system:user:update',
    sort: 2
  },
  {
    key: 'manage_user_delete',
    parentKey: 'manage_user',
    name: '删除用户',
    type: 3,
    permission: 'system:user:delete',
    sort: 3
  },
  {
    key: 'manage_user_assign',
    parentKey: 'manage_user',
    name: '分配角色',
    type: 3,
    permission: 'system:user:assign',
    sort: 4
  },
  {
    key: 'manage_role',
    parentKey: 'manage',
    name: '角色管理',
    type: 2,
    path: '/home/manageHomePage/role',
    permission: 'system:role:list',
    icon: 'Avatar',
    sort: 2
  },
  {
    key: 'manage_role_create',
    parentKey: 'manage_role',
    name: '新增角色',
    type: 3,
    permission: 'system:role:create',
    sort: 1
  },
  {
    key: 'manage_role_update',
    parentKey: 'manage_role',
    name: '编辑角色',
    type: 3,
    permission: 'system:role:update',
    sort: 2
  },
  {
    key: 'manage_role_delete',
    parentKey: 'manage_role',
    name: '删除角色',
    type: 3,
    permission: 'system:role:delete',
    sort: 3
  },
  {
    key: 'manage_role_bind',
    parentKey: 'manage_role',
    name: '绑定菜单',
    type: 3,
    permission: 'system:role:bind',
    sort: 4
  },
  {
    key: 'manage_menu',
    parentKey: 'manage',
    name: '菜单配置',
    type: 2,
    path: '/home/manageHomePage/menu',
    permission: 'system:menu:list',
    icon: 'Menu',
    sort: 3
  },
  {
    key: 'manage_menu_create',
    parentKey: 'manage_menu',
    name: '新增菜单',
    type: 3,
    permission: 'system:menu:create',
    sort: 1
  },
  {
    key: 'manage_menu_update',
    parentKey: 'manage_menu',
    name: '编辑菜单',
    type: 3,
    permission: 'system:menu:update',
    sort: 2
  },
  {
    key: 'manage_menu_delete',
    parentKey: 'manage_menu',
    name: '删除菜单',
    type: 3,
    permission: 'system:menu:delete',
    sort: 3
  },
  {
    key: 'manage_points',
    parentKey: 'manage',
    name: '积分管理',
    type: 2,
    path: '/home/manageHomePage/points',
    permission: 'system:points:list',
    icon: 'Coin',
    sort: 4
  },
  {
    key: 'manage_points_view',
    parentKey: 'manage_points',
    name: '查看积分',
    type: 3,
    permission: 'system:points:list',
    sort: 1
  },
  {
    key: 'manage_points_operate',
    parentKey: 'manage_points',
    name: '积分操作',
    type: 3,
    permission: 'system:points:operate',
    sort: 2
  },
  {
    key: 'manage_points_overview',
    parentKey: 'manage_points',
    name: '积分概览',
    type: 2,
    path: '/home/manageHomePage/points/overview',
    permission: 'system:points:list',
    icon: 'DataBoard',
    sort: 1
  },
  {
    key: 'manage_points_rules',
    parentKey: 'manage_points',
    name: '规则配置',
    type: 2,
    path: '/home/manageHomePage/points/rules',
    permission: 'system:points:list',
    icon: 'SetUp',
    sort: 2
  },
  {
    key: 'manage_points_levels',
    parentKey: 'manage_points',
    name: '等级配置',
    type: 2,
    path: '/home/manageHomePage/points/levels',
    permission: 'system:points:list',
    icon: 'TrophyBase',
    sort: 3
  },
  {
    key: 'manage_task',
    parentKey: 'manage',
    name: '任务管理',
    type: 1,
    path: '',
    permission: 'system:task:list',
    icon: 'List',
    sort: 5
  },
  {
    key: 'manage_task_overview',
    parentKey: 'manage_task',
    name: '任务概览',
    type: 2,
    path: '/home/manageHomePage/task/overview',
    permission: 'system:task:list',
    icon: 'DataAnalysis',
    sort: 1
  },
  {
    key: 'manage_task_list',
    parentKey: 'manage_task',
    name: '任务列表',
    type: 2,
    path: '/home/manageHomePage/task/list',
    permission: 'system:task:list',
    icon: 'Document',
    sort: 2
  },
  {
    key: 'manage_task_audit',
    parentKey: 'manage_task',
    name: '任务审核',
    type: 2,
    path: '/home/manageHomePage/task/audit',
    permission: 'system:task:audit',
    icon: 'Checked',
    sort: 3
  },
  {
    key: 'manage_task_shipping',
    parentKey: 'manage_task',
    name: '奖励发放',
    type: 2,
    path: '/home/manageHomePage/task/shipping',
    permission: 'system:task:operate',
    icon: 'Van',
    sort: 4
  },
  {
    key: 'manage_task_view',
    parentKey: 'manage_task',
    name: '查看任务',
    type: 3,
    permission: 'system:task:list',
    sort: 11
  },
  {
    key: 'manage_task_operate',
    parentKey: 'manage_task',
    name: '任务操作',
    type: 3,
    permission: 'system:task:operate',
    sort: 12
  },
  {
    key: 'manage_task_audit_btn',
    parentKey: 'manage_task',
    name: '任务审核',
    type: 3,
    permission: 'system:task:audit',
    sort: 13
  },
  {
    key: 'manage_notice',
    parentKey: 'manage',
    name: '通知管理',
    type: 2,
    path: '/home/manageHomePage/notice',
    icon: 'Bell',
    sort: 6
  },
  {
    key: 'manage_app',
    parentKey: 'manage',
    name: '应用管理',
    type: 2,
    path: '/home/manageHomePage/app',
    permission: 'system:app:list',
    icon: 'Grid',
    sort: 7
  },
  {
    key: 'manage_app_list',
    parentKey: 'manage_app',
    name: '应用列表',
    type: 2,
    path: '/home/manageHomePage/app',
    permission: 'system:app:list',
    icon: 'Menu',
    sort: 0
  },
  {
    key: 'manage_app_publish',
    parentKey: 'manage_app',
    name: '发布应用',
    type: 3,
    permission: 'system:app:publish',
    sort: 1
  },
  {
    key: 'manage_shell_release',
    parentKey: 'manage_app',
    name: '壳版本发布',
    type: 2,
    path: '/home/manageHomePage/app/shell',
    permission: 'system:shell:release',
    icon: 'Upload',
    sort: 2
  },
  {
    key: 'manage_app_ops',
    parentKey: 'manage_app',
    name: '运营 Banner',
    type: 2,
    path: '/home/manageHomePage/app/opsBanner',
    permission: 'system:app:ops',
    icon: 'Picture',
    sort: 3
  },
  {
    key: 'manage_app_debug_wl',
    parentKey: 'manage_app',
    name: '调试白名单',
    type: 2,
    path: '/home/manageHomePage/app/debugWhitelist',
    permission: 'system:app:publish',
    icon: 'Key',
    sort: 4
  },
  {
    key: 'manage_app_gray',
    parentKey: 'manage_app',
    name: '灰度策略',
    type: 3,
    permission: 'system:app:gray',
    sort: 5
  },
  {
    key: 'mobile_shell',
    name: '移动端',
    type: 1,
    path: '/mobile',
    icon: 'Iphone',
    client: 'mobile',
    sort: 20
  },
  {
    key: 'mobile_workbench',
    parentKey: 'mobile_shell',
    name: '工作台',
    type: 2,
    path: '/pages/workbench/index',
    permission: 'mobile:shell:use',
    client: 'mobile',
    isTab: 1,
    sort: 1
  },
  {
    key: 'mobile_store',
    parentKey: 'mobile_shell',
    name: '应用中心',
    type: 2,
    path: '/pages/store/index',
    permission: 'mobile:module:store',
    client: 'mobile',
    isTab: 1,
    sort: 2
  },
  {
    key: 'mobile_install',
    parentKey: 'mobile_shell',
    name: '安装模块',
    type: 3,
    permission: 'mobile:module:install',
    client: 'mobile',
    sort: 3
  },
  {
    key: 'mobile_uninstall',
    parentKey: 'mobile_shell',
    name: '卸载模块',
    type: 3,
    permission: 'mobile:module:uninstall',
    client: 'mobile',
    sort: 4
  },
  {
    key: 'mobile_message',
    parentKey: 'mobile_shell',
    name: '消息',
    type: 2,
    path: '/pages/messages/index',
    permission: 'mobile:message:read',
    client: 'mobile',
    isTab: 1,
    sort: 5
  },
  {
    key: 'mobile_me',
    parentKey: 'mobile_shell',
    name: '我的',
    type: 2,
    path: '/pages/me/index',
    client: 'mobile',
    isTab: 1,
    sort: 6
  },
  {
    key: 'mobile_account',
    parentKey: 'mobile_shell',
    name: '编辑账户',
    type: 3,
    permission: 'mobile:account:edit',
    client: 'mobile',
    sort: 7
  },
  {
    key: 'mobile_search',
    parentKey: 'mobile_shell',
    name: '全局搜索',
    type: 2,
    path: '/pages/search/index',
    permission: 'mobile:search:use',
    client: 'mobile',
    sort: 8
  },
  {
    key: 'mobile_scan',
    parentKey: 'mobile_shell',
    name: '扫一扫',
    type: 2,
    path: '/pages/scan/index',
    permission: 'mobile:shell:use',
    client: 'mobile',
    sort: 9
  },
  {
    key: 'mobile_feedback',
    parentKey: 'mobile_shell',
    name: '意见反馈',
    type: 2,
    path: '/pages/feedback/index',
    permission: 'mobile:feedback:submit',
    client: 'mobile',
    sort: 10
  },
  {
    key: 'mobile_help',
    parentKey: 'mobile_shell',
    name: '常见问题',
    type: 2,
    path: '/pages/help/index',
    permission: 'mobile:shell:use',
    client: 'mobile',
    sort: 11
  },
  {
    key: 'mobile_demo_module',
    parentKey: 'mobile_shell',
    name: '示例模块',
    type: 2,
    path: '',
    permission: 'mobile:shell:use',
    client: 'mobile',
    moduleCode: 'demo.hello',
    sort: 12
  },
  {
    key: 'manage_logs',
    parentKey: 'manage',
    name: '日志管理',
    type: 2,
    path: '/home/manageHomePage/logs',
    icon: 'Document',
    sort: 8
  },
  {
    key: 'manage_survey',
    parentKey: 'manage',
    name: '问卷管理',
    type: 2,
    path: '/home/survey',
    permission: 'survey:questionnaire:list',
    icon: 'Document',
    sort: 9
  },
  {
    key: 'manage_survey_create',
    parentKey: 'manage_survey',
    name: '创建问卷',
    type: 3,
    permission: 'survey:questionnaire:create',
    sort: 1
  },
  {
    key: 'manage_survey_update',
    parentKey: 'manage_survey',
    name: '编辑问卷',
    type: 3,
    permission: 'survey:questionnaire:update',
    sort: 2
  },
  {
    key: 'manage_survey_delete',
    parentKey: 'manage_survey',
    name: '删除问卷',
    type: 3,
    permission: 'survey:questionnaire:delete',
    sort: 3
  },
  {
    key: 'manage_survey_publish',
    parentKey: 'manage_survey',
    name: '发布问卷',
    type: 3,
    permission: 'survey:questionnaire:publish',
    sort: 4
  },
  {
    key: 'manage_survey_analyze',
    parentKey: 'manage_survey',
    name: '统计分析',
    type: 3,
    permission: 'survey:questionnaire:analyze',
    sort: 5
  },
  {
    key: 'manage_survey_export',
    parentKey: 'manage_survey',
    name: '导出数据',
    type: 3,
    permission: 'survey:questionnaire:export',
    sort: 6
  },
  {
    key: 'manage_survey_template_btn',
    parentKey: 'manage_survey',
    name: '模板管理',
    type: 3,
    permission: 'survey:questionnaire:template',
    sort: 7
  },
  {
    key: 'manage_survey_question_bank_btn',
    parentKey: 'manage_survey',
    name: '题库管理',
    type: 3,
    permission: 'survey:questionnaire:questionBank',
    sort: 8
  },
  {
    key: 'manage_survey_grading',
    parentKey: 'manage_survey',
    name: '阅卷评分',
    type: 3,
    permission: 'survey:questionnaire:grading',
    sort: 9
  },
  {
    key: 'manage_survey_template',
    parentKey: 'manage_survey',
    name: '模板库',
    type: 2,
    path: '/home/survey/template',
    permission: 'survey:questionnaire:template',
    icon: 'Files',
    sort: 10
  },
  {
    key: 'manage_survey_question_bank',
    parentKey: 'manage_survey',
    name: '题库',
    type: 2,
    path: '/home/survey/question-bank',
    permission: 'survey:questionnaire:questionBank',
    icon: 'Collection',
    sort: 11
  },
  {
    key: 'logs',
    name: '日志管理',
    type: 1,
    path: '/home/logs',
    icon: 'Document',
    sort: 15
  },
  {
    key: 'logs_operation',
    parentKey: 'logs',
    name: '操作日志',
    type: 2,
    path: '/home/logs/operation',
    icon: 'Tickets',
    sort: 1
  },
  {
    key: 'logs_business',
    parentKey: 'logs',
    name: '业务日志',
    type: 2,
    path: '/home/logs/business',
    icon: 'Notebook',
    sort: 2
  },
  {
    key: 'logs_api',
    parentKey: 'logs',
    name: '接口日志',
    type: 2,
    path: '/home/logs/api',
    icon: 'Connection',
    sort: 3
  },
  {
    key: 'logs_performance',
    parentKey: 'logs',
    name: '性能日志',
    type: 2,
    path: '/home/logs/performance',
    icon: 'Odometer',
    sort: 4
  },
  {
    key: 'logs_traffic',
    parentKey: 'logs',
    name: '访问分析',
    type: 2,
    path: '/home/logs/traffic',
    icon: 'DataLine',
    sort: 5
  },
  {
    key: 'logs_website',
    parentKey: 'logs',
    name: '网站配置',
    type: 2,
    path: '/home/logs/website',
    icon: 'Monitor',
    sort: 6
  },
  {
    key: 'profile',
    name: '个人中心',
    type: 2,
    path: '/home/personalCenter/basicInfo',
    icon: 'User',
    sort: 20
  },
  {
    key: 'profile_points',
    parentKey: 'profile',
    name: '我的积分',
    type: 2,
    path: '/home/personalCenter/points',
    permission: 'system:points:self',
    icon: 'Wallet',
    sort: 1
  },
  // ===== IM 聊天体系 =====
  // 注意：im 为顶级菜单（与 个人中心/管理中心 平级），不能挂在 home(首页) 下——
  // 前端 AsideList 会把 path=/home/homepage 的 home 节点整体滤掉（首页单独硬编码渲染），
  // 若 im 作为 home 子节点会一并被隐藏。
  {
    key: 'im',
    name: 'IM 聊天',
    type: 2,
    path: '/home/im',
    permission: 'tool:chat:use',
    icon: 'ChatDotRound',
    sort: 30
  },
  {
    key: 'im_hall',
    parentKey: 'im',
    name: '社交大厅',
    type: 2,
    path: '/home/im/hall',
    sort: 1
  },
  {
    key: 'im_contacts',
    parentKey: 'im',
    name: '通讯录',
    type: 2,
    path: '/home/im/contacts',
    sort: 2
  },
  {
    key: 'im_profile',
    parentKey: 'im',
    name: '资料与隐私',
    type: 2,
    path: '/home/im/profile',
    sort: 3
  },
  {
    key: 'im_room_create',
    parentKey: 'im',
    name: '创建房间',
    type: 3,
    permission: 'chat:room:create',
    sort: 4
  },
  // 管理端 IM
  {
    key: 'manage_chat',
    parentKey: 'manage',
    name: '聊天管理',
    type: 2,
    path: '/home/manageHomePage/chat',
    permission: 'system:chat:list',
    icon: 'ChatLineSquare',
    sort: 8
  },
  {
    key: 'manage_chat_rooms',
    parentKey: 'manage_chat',
    name: '房间管理',
    type: 3,
    permission: 'system:chat:operate',
    sort: 1
  },
  {
    key: 'manage_chat_groups',
    parentKey: 'manage_chat',
    name: '群管理',
    type: 3,
    permission: 'system:chat:list',
    sort: 2
  },
  {
    key: 'manage_chat_messages',
    parentKey: 'manage_chat',
    name: '消息记录',
    type: 3,
    permission: 'system:chat:list',
    sort: 3
  },
  {
    key: 'manage_chat_reports',
    parentKey: 'manage_chat',
    name: '举报审核',
    type: 3,
    permission: 'chat:moderation:operate',
    sort: 4
  },
  {
    key: 'manage_chat_analytics',
    parentKey: 'manage_chat',
    name: '数据分析',
    type: 3,
    permission: 'system:chat:analytics',
    sort: 5
  },
  {
    key: 'manage_chat_settings',
    parentKey: 'manage_chat',
    name: '系统配置',
    type: 3,
    permission: 'system:chat:operate',
    sort: 6
  }
]

const ROLE_SEEDS = [
  {
    name: '普通用户',
    code: 'user',
    remark: '基础访问',
    sort: 1,
    menuKeys: [
      'home',
      'profile',
      'profile_points',
      'im',
      'im_hall',
      'im_contacts',
      'im_profile',
      'im_room_create',
      'mobile_shell',
      'mobile_workbench',
      'mobile_store',
      'mobile_install',
      'mobile_uninstall',
      'mobile_message',
      'mobile_me',
      'mobile_account',
      'mobile_search',
      'mobile_scan',
      'mobile_feedback',
      'mobile_help',
      'mobile_demo_module'
    ]
  },
  {
    name: '进阶用户',
    code: 'advanced',
    remark: '进阶功能',
    sort: 2,
    menuKeys: [
      'home',
      'profile',
      'profile_points',
      'manage',
      'manage_notice',
      'manage_app',
      'manage_app_list',
      'manage_app_publish',
      'manage_points',
      'manage_points_view',
      'manage_points_overview',
      'manage_points_rules',
      'manage_points_levels',
      'manage_task',
      'manage_task_overview',
      'manage_task_list',
      'manage_task_view',
      'mobile_shell',
      'mobile_workbench',
      'mobile_store',
      'mobile_install',
      'mobile_uninstall',
      'mobile_message',
      'mobile_me',
      'mobile_account',
      'mobile_search',
      'mobile_scan',
      'mobile_feedback',
      'mobile_help',
      'mobile_demo_module'
    ]
  },
  {
    name: '管理员',
    code: 'admin',
    remark: '系统管理',
    sort: 3,
    menuKeys: [
      'home',
      'profile',
      'profile_points',
      'manage',
      'manage_user',
      'manage_user_create',
      'manage_user_update',
      'manage_user_delete',
      'manage_user_assign',
      'manage_role',
      'manage_role_create',
      'manage_role_update',
      'manage_role_delete',
      'manage_role_bind',
      'manage_menu',
      'manage_menu_create',
      'manage_menu_update',
      'manage_menu_delete',
      'manage_points',
      'manage_points_view',
      'manage_points_operate',
      'manage_points_overview',
      'manage_points_rules',
      'manage_points_levels',
      'manage_notice',
      'manage_task',
      'manage_task_overview',
      'manage_task_list',
      'manage_task_audit',
      'manage_task_shipping',
      'manage_task_view',
      'manage_task_operate',
      'manage_task_audit_btn',
      'manage_app',
      'manage_app_list',
      'manage_app_publish',
      'manage_shell_release',
      'manage_app_ops',
      'manage_app_debug_wl',
      'manage_app_gray',
      'manage_logs',
      'manage_survey',
      'manage_survey_create',
      'manage_survey_update',
      'manage_survey_delete',
      'manage_survey_publish',
      'manage_survey_analyze',
      'manage_survey_export',
      'manage_survey_template_btn',
      'manage_survey_question_bank_btn',
      'manage_survey_grading',
      'manage_survey_template',
      'manage_survey_question_bank',
      'logs',
      'logs_operation',
      'logs_business',
      'logs_api',
      'logs_performance',
      'logs_traffic',
      'logs_website',
      'mobile_shell',
      'mobile_workbench',
      'mobile_store',
      'mobile_install',
      'mobile_uninstall',
      'mobile_message',
      'mobile_me',
      'mobile_account',
      'mobile_search',
      'mobile_scan',
      'mobile_feedback',
      'mobile_help',
      'mobile_demo_module',
      'im',
      'im_hall',
      'im_contacts',
      'im_profile',
      'im_room_create',
      'manage_chat',
      'manage_chat_rooms',
      'manage_chat_groups',
      'manage_chat_messages',
      'manage_chat_reports',
      'manage_chat_analytics',
      'manage_chat_settings'
    ]
  },
  {
    name: '超级管理员',
    code: 'super_admin',
    remark: '全部权限',
    sort: 4,
    menuKeys: 'ALL' as const
  }
]

async function upsertRoles() {
  const now = Date.now()
  const map = new Map<string, bigint>()
  for (const role of ROLE_SEEDS) {
    const row = await prisma.sysRole.upsert({
      where: { code: role.code },
      create: {
        name: role.name,
        code: role.code,
        remark: role.remark,
        status: 1,
        sort: role.sort,
        createTime: BigInt(now),
        updateTime: BigInt(now)
      },
      update: {
        name: role.name,
        remark: role.remark,
        status: 1,
        sort: role.sort,
        updateTime: BigInt(now)
      }
    })
    map.set(role.code, row.id)
  }
  return map
}

async function upsertMenus() {
  const now = Date.now()
  const keyToId = new Map<string, bigint>()

  // Create parents first by iterating in declaration order
  for (const m of MENU_SEEDS) {
    const parentId = m.parentKey
      ? (keyToId.get(m.parentKey) ?? BigInt(0))
      : BigInt(0)
    const existing = await prisma.sysMenu.findFirst({
      where: {
        name: m.name,
        parentId,
        type: m.type,
        ...(m.path ? { path: m.path } : {}),
        ...(m.permission ? { permission: m.permission } : {})
      }
    })

    let row
    const client = m.client || (m.key.startsWith('mobile_') ? 'mobile' : 'pc')
    if (existing) {
      row = await prisma.sysMenu.update({
        where: { id: existing.id },
        data: {
          parentId,
          name: m.name,
          type: m.type,
          path: m.path ?? null,
          permission: m.permission ?? null,
          icon: m.icon ?? null,
          client,
          moduleCode: m.moduleCode ?? null,
          sort: m.sort,
          visible: 1,
          status: 1,
          updateTime: BigInt(now)
        } as any
      })
    } else {
      row = await prisma.sysMenu.create({
        data: {
          parentId,
          name: m.name,
          type: m.type,
          path: m.path ?? null,
          permission: m.permission ?? null,
          icon: m.icon ?? null,
          client,
          moduleCode: m.moduleCode ?? null,
          sort: m.sort,
          visible: 1,
          status: 1,
          createTime: BigInt(now),
          updateTime: BigInt(now)
        } as any
      })
    }
    // is_tab may be missing from stale prisma client (Windows EPERM on generate)
    if (m.isTab != null) {
      await prisma.$executeRawUnsafe(
        'UPDATE sys_menu SET is_tab = ? WHERE id = ?',
        m.isTab,
        row.id
      )
    }
    keyToId.set(m.key, row.id)
  }
  return keyToId
}

async function bindRoleMenus(
  roleMap: Map<string, bigint>,
  menuMap: Map<string, bigint>
) {
  const allMenuIds = [...menuMap.values()]
  for (const role of ROLE_SEEDS) {
    const roleId = roleMap.get(role.code)
    if (!roleId) continue
    const menuIds =
      role.menuKeys === 'ALL'
        ? allMenuIds
        : role.menuKeys
            .map(k => menuMap.get(k))
            .filter((id): id is bigint => id !== undefined)

    await prisma.sysRoleMenu.deleteMany({ where: { roleId } })
    if (menuIds.length) {
      await prisma.sysRoleMenu.createMany({
        data: menuIds.map(menuId => ({ roleId, menuId })),
        skipDuplicates: true
      })
    }
  }
}

async function bindUsersByLevel(roleMap: Map<string, bigint>) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, level: true }
  })
  for (const user of users) {
    const code = LEVEL_TO_ROLE[user.level ?? 1] || 'user'
    const roleId = roleMap.get(code)
    if (!roleId) continue
    const existing = await prisma.sysUserRole.findFirst({
      where: { userId: user.id }
    })
    if (existing) continue
    await prisma.sysUserRole.create({
      data: { userId: user.id, roleId }
    })
  }
}

async function main() {
  console.log('[seed-rbac] start')
  const roleMap = await upsertRoles()
  const menuMap = await upsertMenus()
  await bindRoleMenus(roleMap, menuMap)
  await bindUsersByLevel(roleMap)
  console.log('[seed-rbac] done', {
    roles: roleMap.size,
    menus: menuMap.size
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
