-- ============================================================
-- 心智测评系统（问星）数据库脚本
-- 依据：prd/心智测评系统_PRD_v1.0.md 5.2 / 4.8.1 / 二.权限码
-- 范围：assessment_ 前缀 5 张新表 + points 3 条种子规则 + RBAC 权限码
-- 说明：与 prisma/schema.prisma 中 AssessmentOaConfig / AssessmentReplyRule /
--       AssessmentChannel / AssessmentInfo / AssessmentEvent 五个 model 对应
-- ============================================================

-- ------------------------------------------------------------
-- 5.2.1 assessment_oa_config（公众号能力配置，单行表）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_oa_config (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  official_name        VARCHAR(64)     NOT NULL COMMENT '公众号名称（展示用）',
  wechat_id            VARCHAR(64)     NULL COMMENT '公众号原始 ID（gh_ 开头）',
  account_type         TINYINT         NOT NULL DEFAULT 0 COMMENT '账号类型 0=个人未认证订阅号 1=认证订阅号 2=认证服务号',
  qr_code_url          VARCHAR(255)    NULL COMMENT '关注二维码图片',
  guide_enabled        TINYINT         NOT NULL DEFAULT 1 COMMENT '引导位总开关 1=开 0=关（4.4.1）',
  result_guide_title   VARCHAR(64)     NULL COMMENT '报告页引导标题',
  result_guide_desc    VARCHAR(128)    NULL COMMENT '报告页引导描述',
  complete_guide_title VARCHAR(64)     NULL COMMENT '完成页引导标题',
  complete_guide_desc  VARCHAR(128)    NULL COMMENT '完成页引导描述',
  poster_share_text    VARCHAR(255)    NULL COMMENT '海报默认分享文案',
  plaza_path           VARCHAR(128)    NULL COMMENT 'H5 问星广场路径，如 /assessment/list',
  updated_by           BIGINT UNSIGNED NULL COMMENT '最近操作人（user.id）',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_oa_single (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='公众号能力配置——全系统仅一行有效记录；运营改后前端沿用 5 分钟本地缓存';

-- 初始单行种子（部署时执行一次）
INSERT INTO assessment_oa_config
  (id, official_name, wechat_id, account_type, guide_enabled,
   result_guide_title, result_guide_desc,
   complete_guide_title, complete_guide_desc,
   poster_share_text, plaza_path)
VALUES
  (1, '易道心智', 'gh_yidao_xinzhi', 0, 1,
   '关注「易道心智」，解锁完整解读', '每面一卦，问心问星——更多心智测评与能量指引，等你开启',
   '关注「易道心智」，获取完整解读', '回到公众号回复「测评」，即可查看你的完整报告与专属指引',
   '我刚在问星完成了心智测评，快来看看你的心智原型吧！',
   '/assessment/list')
ON DUPLICATE KEY UPDATE id = id;

-- ------------------------------------------------------------
-- 5.2.2 assessment_reply_rule（回复规则仓库，SOP 源）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_reply_rule (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  rule_type      VARCHAR(16)     NOT NULL COMMENT 'keyword=关键词回复 welcome=关注回复',
  keywords       VARCHAR(255)    NULL COMMENT '触发词，逗号分隔；rule_type=welcome 时为空',
  reply_content  TEXT            NULL COMMENT '回复文字内容，含落地链接（S2/S3 粘贴对象）',
  channel_source VARCHAR(16)     NULL COMMENT '统计归属 source 枚举（article/keyword/welcome/menu/share）',
  ref_id         VARCHAR(32)     NULL COMMENT '规则暗标识，落链接 query.refId',
  link_url       VARCHAR(255)    NULL COMMENT '规则携带的落地链接（冗余展示用）',
  status         TINYINT         NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  sync_status    VARCHAR(16)     NOT NULL DEFAULT 'pending' COMMENT 'pending=待手工同步 synced=已同步公众号',
  sort           INT             NOT NULL DEFAULT 0 COMMENT '规则排列顺序',
  remark         VARCHAR(255)    NULL COMMENT '运营备注',
  creator_id     BIGINT UNSIGNED NULL COMMENT '创建人（user.id）',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rule_type (rule_type, status, sort)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='回复规则仓库——管理端维护正文 + 双链接，复制到公众号后台生效';

-- ------------------------------------------------------------
-- 5.2.3 assessment_channel（渠道入口投放）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_channel (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  name        VARCHAR(64)     NOT NULL COMMENT '入口名称（如：10 月图文-情绪能量）',
  source      VARCHAR(16)     NOT NULL COMMENT '来源 article/keyword/welcome/menu/share',
  ref_id      VARCHAR(32)     NOT NULL COMMENT '暗标识（落链接 query.refId）',
  target_type VARCHAR(16)     NOT NULL DEFAULT 'fill' COMMENT '落点类型 fill=测评直达 plaza=问星广场',
  survey_id   BIGINT UNSIGNED NULL COMMENT 'target=fill 时必填：指向 survey.id',
  share_code  VARCHAR(32)     NULL COMMENT 'target=fill 时必填：问卷分享码',
  info_id     BIGINT UNSIGNED NULL COMMENT 'target=fill 时可填：关联 assessment_info.id',
  status      TINYINT         NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
  start_at    DATETIME        NULL COMMENT '投放开始时间',
  end_at      DATETIME        NULL COMMENT '投放结束时间',
  remark      VARCHAR(255)    NULL COMMENT '运营备注/投放位置描述',
  creator_id  BIGINT UNSIGNED NULL COMMENT '创建人（user.id）',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_source_ref (source, ref_id),
  KEY idx_survey (survey_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='渠道入口投放——生成指向 fill/plaza 两种落地链接';

-- ------------------------------------------------------------
-- 5.2.4 assessment_info（测评上架登记）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_info (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  title         VARCHAR(64)     NOT NULL COMMENT '测评架位标题（广场卡片主标题）',
  type_key      VARCHAR(32)     NOT NULL COMMENT '类型库键（4.1.1 十型）',
  survey_id     BIGINT UNSIGNED NOT NULL COMMENT '关联问卷 id',
  cover_url     VARCHAR(255)    NULL COMMENT '封面图（可缺省用 type_key 默认底图）',
  subtitle      VARCHAR(128)    NULL COMMENT '一句话卖点（广场卡片副标题）',
  tags          VARCHAR(255)    NULL COMMENT '标签，逗号分隔；首位约定承载角标 HOT/NEW/限免',
  question_num  INT             NOT NULL DEFAULT 0 COMMENT '题目数（上架校验与广场展示）',
  duration_desc VARCHAR(32)     NULL COMMENT '时长描述文案（如 约 3 分钟）',
  sort          INT             NOT NULL DEFAULT 0 COMMENT '广场排列顺序（越大越靠前）',
  status        TINYINT         NOT NULL DEFAULT 0 COMMENT '0=草稿 1=已上架 2=已下架',
  published_at  DATETIME        NULL COMMENT '首次上架时间',
  creator_id    BIGINT UNSIGNED NULL COMMENT '创建人（user.id）',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_sort (status, sort),
  KEY idx_survey (survey_id),
  KEY idx_type (type_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='测评上架登记——题目(survey)与广场展示之间的上架层';

-- ------------------------------------------------------------
-- 5.2.5 assessment_event（埋点事件中心）
-- 注：survey_id 为 E02/E03 归因与看板 Top 所需，原 DDL 注释遗漏，此处补齐
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_event (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  event_type         VARCHAR(32)     NOT NULL COMMENT 'channel_visit/plaza_click/response_complete/register_show/register_success/guide_show/guide_click/share_click/poster_create/follow_scan',
  user_id            BIGINT UNSIGNED NULL COMMENT 'user.id；游客为 NULL',
  session_id         VARCHAR(64)     NOT NULL COMMENT '前端 sessionStorage 生成的会话标识',
  source             VARCHAR(16)     NULL COMMENT '渠道枚举 article/keyword/welcome/menu/share（E01 必带）',
  ref_id             VARCHAR(32)     NULL COMMENT '渠道暗标识（E01 必带）',
  target             VARCHAR(16)     NULL COMMENT 'E01 落点 fill/plaza',
  position           VARCHAR(32)     NULL COMMENT '位次扩展位',
  survey_id          BIGINT UNSIGNED NULL COMMENT '关联问卷 id（E02/E03）',
  survey_response_id BIGINT UNSIGNED NULL COMMENT 'E03 关联答卷 id',
  is_new_user        TINYINT         NOT NULL DEFAULT 0 COMMENT 'E05 专属：1=新建账号 0=已存在登录',
  user_agent         VARCHAR(255)    NULL COMMENT 'UA 摘要（前端截断后上报）',
  ip_city            VARCHAR(32)     NULL COMMENT 'IP 城市名，不存原文 IP',
  created_day        DATE            NOT NULL COMMENT '事件日期（按日聚合用，冗余字段）',
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_type_day (event_type, created_day),
  KEY idx_session (session_id),
  KEY idx_source_ref (source, ref_id, created_day),
  KEY idx_user (user_id),
  KEY idx_survey (survey_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='埋点事件中心——L2 业务事件统一落表；写入前经 4.6.3 防刷链路';

-- ============================================================
-- 4.8.1 积分种子规则（points 域，rule_code 直接扩展；均不发券、FIXED）
-- points_rule 实际列名为 snake_case，与 prisma PointsRule 对应
-- ============================================================
INSERT INTO points_rule
  (name, code, source, points_type, points_value, calc_method,
   daily_limit, monthly_limit, single_limit, valid_days, description, enabled, priority)
VALUES
  ('完成正式测评', 'ASSESSMENT_COMPLETE', 'assessment', 'GENERAL', 5, 'FIXED',
   2, 30, 0, 365, '完成一次正式测评（打卡型 quick_daily 不计）；幂等键=survey_response/responseId', 1, 100),
  ('生成测评海报', 'ASSESSMENT_POSTER', 'assessment', 'GENERAL', 5, 'FIXED',
   3, 20, 0, 365, '生成测评分享图成功（E09）；幂等键=assessment_event/事件id', 1, 100),
  ('新人注册礼', 'REGISTER_WELCOME', 'assessment', 'GENERAL', 20, 'FIXED',
   0, 0, 1, 365, '注册成功即奖（恒定欢迎分），终身 1 次；幂等键=user/userId', 1, 100)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  points_value = VALUES(points_value),
  source = VALUES(source),
  description = VALUES(description);

-- 4.8.2 发放幂等并发兜底：points_transaction 唯一索引
-- 注意：执行前需确认无历史重复数据，否则先清理再建索引
-- ALTER TABLE points_transaction
--   ADD UNIQUE KEY uniq_assessment_ref (source, reference_type, reference_id);

-- ============================================================
-- RBAC 权限码（seed-rbac 注入，实际列名以后端 rbac 表为准）
-- 菜单可见性 5 码：
--   assessment:oa:list       /home/assessment           公众号配置
--   assessment:info:list     /home/assessment/list      测评上架管理
--   assessment:channel:list  /home/assessment/channel   渠道入口
--   assessment:reply:list    /home/assessment/reply     公众号回复规则
--   assessment:stats:view    /home/assessment/stats     数据看板
-- 按钮级操作 4 码：
--   assessment:oa:manage / assessment:info:manage /
--   assessment:channel:manage / assessment:reply:manage
-- superior_admin 直通不受限；运营角色绑定上述权限码。
-- 示例（列名按后端 seed-rbac 实际调整后执行）：
-- INSERT INTO sys_menu (parent_id, name, type, path, permission, sort, visible, status)
-- VALUES
--   (0, '心智测评', 1, '/home/assessment', 'assessment:oa:list', 90, 1, 1),
--   (0, '测评上架管理', 1, '/home/assessment/list', 'assessment:info:list', 91, 1, 1),
--   (0, '渠道入口', 1, '/home/assessment/channel', 'assessment:channel:list', 92, 1, 1),
--   (0, '公众号回复规则', 1, '/home/assessment/reply', 'assessment:reply:list', 93, 1, 1),
--   (0, '数据看板', 1, '/home/assessment/stats', 'assessment:stats:view', 94, 1, 1);
-- ============================================================
