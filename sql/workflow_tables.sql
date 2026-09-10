-- ============================================
-- 流程编排系统 - 数据库表结构
-- MySQL 8.0+
-- 执行: pnpm prisma:workflow-tables
-- ============================================

CREATE TABLE IF NOT EXISTS `workflow_category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(64) NOT NULL COMMENT '分类名称',
  `code` VARCHAR(32) NOT NULL COMMENT '分类编码',
  `icon` VARCHAR(128) DEFAULT NULL COMMENT '图标',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '描述',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程分类表';

CREATE TABLE IF NOT EXISTS `workflow` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `workflow_no` VARCHAR(32) NOT NULL COMMENT '流程编号',
  `name` VARCHAR(128) NOT NULL COMMENT '流程名称',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `icon` VARCHAR(128) DEFAULT NULL COMMENT '图标',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT '分类ID',
  `tags` JSON DEFAULT NULL COMMENT '标签',
  `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT '状态: DRAFT/PENDING/PUBLISHED/REJECTED/PAUSED/OFFLINE',
  `current_version` INT NOT NULL DEFAULT 0 COMMENT '当前版本',
  `graph_data` JSON NOT NULL COMMENT '画布图数据（节点+连线拓扑，含触发器配置）',
  `global_config` JSON DEFAULT NULL COMMENT '全局配置（超时/并发等）',
  `creator_id` BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `auditor_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '审核人ID',
  `audited_at` DATETIME DEFAULT NULL COMMENT '审核时间',
  `audit_remark` VARCHAR(255) DEFAULT NULL COMMENT '审核备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_no` (`workflow_no`),
  KEY `idx_category` (`category_id`),
  KEY `idx_status` (`status`),
  KEY `idx_creator` (`creator_id`),
  KEY `idx_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

CREATE TABLE IF NOT EXISTS `workflow_version` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `workflow_id` BIGINT UNSIGNED NOT NULL COMMENT '流程ID',
  `version` INT NOT NULL COMMENT '版本号',
  `graph_data` JSON NOT NULL COMMENT '画布图数据快照',
  `global_config` JSON DEFAULT NULL COMMENT '全局配置快照',
  `change_note` VARCHAR(255) DEFAULT NULL COMMENT '变更说明',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_version` (`workflow_id`, `version`),
  KEY `idx_workflow` (`workflow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程版本表';

CREATE TABLE IF NOT EXISTS `workflow_execution` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `execution_no` VARCHAR(32) NOT NULL COMMENT '执行编号',
  `workflow_id` BIGINT UNSIGNED NOT NULL COMMENT '流程ID',
  `workflow_version` INT NOT NULL COMMENT '流程版本',
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/RUNNING/SUCCEEDED/FAILED/TIMEOUT/CANCELLED/PAUSED',
  `trigger_type` VARCHAR(16) NOT NULL COMMENT '触发方式: CRON/WEBHOOK/MANUAL/EVENT',
  `trigger_data` JSON DEFAULT NULL COMMENT '触发数据',
  `context` JSON DEFAULT NULL COMMENT '执行上下文（所有变量快照）',
  `result` JSON DEFAULT NULL COMMENT '执行结果',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
  `error_node_id` VARCHAR(64) DEFAULT NULL COMMENT '出错节点ID',
  `duration_ms` INT DEFAULT NULL COMMENT '耗时(毫秒)',
  `started_at` DATETIME DEFAULT NULL COMMENT '开始时间',
  `finished_at` DATETIME DEFAULT NULL COMMENT '结束时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_execution_no` (`execution_no`),
  KEY `idx_workflow` (`workflow_id`),
  KEY `idx_status` (`status`),
  KEY `idx_trigger` (`trigger_type`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程执行实例表';

CREATE TABLE IF NOT EXISTS `execution_step_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `execution_id` BIGINT UNSIGNED NOT NULL COMMENT '执行实例ID',
  `node_id` VARCHAR(64) NOT NULL COMMENT '节点ID',
  `node_type` VARCHAR(32) NOT NULL COMMENT '节点类型: AGENT/TOOL/CONDITION/TRANSFORM/OUTPUT',
  `node_name` VARCHAR(128) DEFAULT NULL COMMENT '节点名称',
  `status` VARCHAR(16) NOT NULL COMMENT '状态: PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED',
  `input_data` JSON DEFAULT NULL COMMENT '输入数据',
  `output_data` JSON DEFAULT NULL COMMENT '输出数据',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息',
  `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数',
  `duration_ms` INT DEFAULT NULL COMMENT '耗时(毫秒)',
  `started_at` DATETIME DEFAULT NULL COMMENT '开始时间',
  `finished_at` DATETIME DEFAULT NULL COMMENT '结束时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_execution` (`execution_id`),
  KEY `idx_node` (`node_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点执行日志表';

CREATE TABLE IF NOT EXISTS `workflow_tool` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(64) NOT NULL COMMENT '工具名称',
  `code` VARCHAR(64) NOT NULL COMMENT '工具编码',
  `category` VARCHAR(32) NOT NULL COMMENT '工具分类',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '描述',
  `icon` VARCHAR(128) DEFAULT NULL COMMENT '图标',
  `endpoint` VARCHAR(255) DEFAULT NULL COMMENT 'API 地址',
  `method` VARCHAR(16) NOT NULL DEFAULT 'GET' COMMENT 'HTTP 方法',
  `auth_config` JSON DEFAULT NULL COMMENT '认证配置',
  `param_schema` JSON NOT NULL COMMENT '参数 Schema',
  `output_schema` JSON DEFAULT NULL COMMENT '输出 Schema',
  `is_builtin` TINYINT NOT NULL DEFAULT 0 COMMENT '是否内置',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `creator_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '创建人ID',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_category` (`category`),
  KEY `idx_builtin` (`is_builtin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具定义表';

CREATE TABLE IF NOT EXISTS `workflow_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(128) NOT NULL COMMENT '模板名称',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `icon` VARCHAR(128) DEFAULT NULL COMMENT '图标',
  `category` VARCHAR(32) NOT NULL COMMENT '模板分类',
  `graph_data` JSON NOT NULL COMMENT '画布图数据',
  `global_config` JSON DEFAULT NULL COMMENT '全局配置',
  `preview_image` VARCHAR(255) DEFAULT NULL COMMENT '预览图地址',
  `author_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '作者ID',
  `is_official` TINYINT NOT NULL DEFAULT 0 COMMENT '是否官方',
  `install_count` INT NOT NULL DEFAULT 0 COMMENT '安装次数',
  `rating` DECIMAL(3,1) NOT NULL DEFAULT 0.0 COMMENT '评分',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category`),
  KEY `idx_official` (`is_official`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程模板表';

CREATE TABLE IF NOT EXISTS `workflow_alert_rule` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `workflow_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '流程ID（NULL=全局规则）',
  `rule_type` VARCHAR(32) NOT NULL COMMENT '规则类型: ERROR_COUNT/TIMEOUT_COUNT/ERROR_RATE/QUEUE_BACKLOG',
  `threshold` INT NOT NULL COMMENT '阈值',
  `window_minutes` INT NOT NULL DEFAULT 5 COMMENT '统计窗口(分钟)',
  `notify_channels` JSON NOT NULL COMMENT '通知渠道 ["FEISHU","NOTIFY"]',
  `notify_users` JSON DEFAULT NULL COMMENT '通知用户',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_workflow` (`workflow_id`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='告警规则表';

CREATE TABLE IF NOT EXISTS `workflow_audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `workflow_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '流程ID',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '操作人ID',
  `action` VARCHAR(32) NOT NULL COMMENT '操作: CREATE/EDIT/PUBLISH/PAUSE/OFFLINE/EXECUTE/CANCEL/DELETE',
  `detail` JSON DEFAULT NULL COMMENT '操作详情',
  `ip_address` VARCHAR(64) DEFAULT NULL COMMENT 'IP 地址',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_workflow` (`workflow_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';
