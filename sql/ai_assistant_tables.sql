-- ============================================
-- AI 助手数据问数（PRD 4.5 / 5.4 / 5.5）- 数据库表结构
-- MySQL 8.0+
-- 执行: pnpm prisma:ai-assistant-tables
-- 说明：与 prisma db push 双轨维护，字段以 schema.prisma 为事实源
-- ============================================

CREATE TABLE IF NOT EXISTS `ai_query_audit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '用户ID；0 = 未登录访客',
  `user_name` VARCHAR(64) NOT NULL DEFAULT 'guest' COMMENT '用户名快照',
  `permission_codes` JSON NOT NULL COMMENT '权限码快照（问数时刻）',
  `conversation_id` VARCHAR(36) DEFAULT NULL COMMENT '关联对话ID',
  `question` TEXT NOT NULL COMMENT '用户问句（永不拼 SQL，仅审计留档）',
  `dataset_code` VARCHAR(32) NOT NULL DEFAULT 'none' COMMENT '命中的数据集；未命中记 none',
  `generated_sql` TEXT DEFAULT NULL COMMENT 'LLM 生成并执行的 SQL 原文',
  `status` VARCHAR(16) NOT NULL COMMENT 'success/denied/rejected/timeout/fail',
  `error_code` VARCHAR(64) DEFAULT NULL COMMENT 'QUERY_PERM_DENIED/QUERY_DATASET_NOT_FOUND/NL2SQL_REJECTED/QUERY_TIMEOUT/QUERY_DB_ERROR/RATE_LIMITED',
  `rows` INT NOT NULL DEFAULT 0 COMMENT '返回行数；≤ 200（服务端强制）',
  `duration_ms` INT NOT NULL DEFAULT 0 COMMENT '总耗时（毫秒）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_dataset` (`dataset_code`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 数据问数审计表';

CREATE TABLE IF NOT EXISTS `ai_dataset_registry` (
  `code` VARCHAR(32) NOT NULL COMMENT '数据集编码：points/workflow/tasks/survey/logs',
  `label` VARCHAR(64) NOT NULL COMMENT '数据集中文名称',
  `allowed_tables` JSON NOT NULL COMMENT '允许查询的表白名单（JOIN 双表均须在列）',
  `required_permission` VARCHAR(128) DEFAULT NULL COMMENT '第二层前置业务权限码',
  `sensitive_fields` JSON NOT NULL COMMENT '禁 SELECT 直出的敏感字段列表',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `description` TEXT DEFAULT NULL COMMENT '表结构数据字典（供 LLM 路由与 NL2SQL）',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 数据问数数据集注册表';
