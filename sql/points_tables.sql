-- ============================================
-- 积分管理体系 - 数据库表结构
-- MySQL 8.0+
-- 执行: pnpm prisma:points-tables
-- ============================================

CREATE TABLE IF NOT EXISTS `points_account` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `points_type` VARCHAR(32) NOT NULL DEFAULT 'GENERAL' COMMENT '积分类型',
  `available_points` INT NOT NULL DEFAULT 0 COMMENT '可用积分',
  `frozen_points` INT NOT NULL DEFAULT 0 COMMENT '冻结积分',
  `total_earned` INT NOT NULL DEFAULT 0 COMMENT '累计获得',
  `total_spent` INT NOT NULL DEFAULT 0 COMMENT '累计消费',
  `level` TINYINT NOT NULL DEFAULT 1 COMMENT '当前等级',
  `level_name` VARCHAR(32) NOT NULL DEFAULT '普通会员' COMMENT '等级名称',
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '账户状态',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_points_type` (`user_id`, `points_type`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分账户表';

CREATE TABLE IF NOT EXISTS `points_transaction` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `transaction_no` VARCHAR(32) NOT NULL COMMENT '交易流水号',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `account_id` BIGINT UNSIGNED NOT NULL COMMENT '积分账户ID',
  `type` VARCHAR(16) NOT NULL COMMENT '交易类型',
  `points` INT NOT NULL COMMENT '积分变动值',
  `balance_before` INT NOT NULL COMMENT '交易前余额',
  `balance_after` INT NOT NULL COMMENT '交易后余额',
  `source` VARCHAR(32) NOT NULL COMMENT '积分来源',
  `reference_id` VARCHAR(64) DEFAULT NULL COMMENT '关联业务ID',
  `reference_type` VARCHAR(32) DEFAULT NULL COMMENT '关联业务类型',
  `description` VARCHAR(255) NOT NULL COMMENT '交易描述',
  `expire_at` DATETIME DEFAULT NULL COMMENT '过期时间',
  `status` VARCHAR(16) NOT NULL DEFAULT 'COMPLETED' COMMENT '交易状态',
  `extra_data` JSON DEFAULT NULL COMMENT '扩展数据',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transaction_no` (`transaction_no`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_type` (`type`),
  KEY `idx_source` (`source`),
  KEY `idx_reference` (`reference_type`, `reference_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_expire_at` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分交易记录表';

CREATE TABLE IF NOT EXISTS `points_rule` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(64) NOT NULL COMMENT '规则名称',
  `code` VARCHAR(32) NOT NULL COMMENT '规则编码',
  `source` VARCHAR(32) NOT NULL COMMENT '积分来源',
  `points_type` VARCHAR(32) NOT NULL DEFAULT 'GENERAL' COMMENT '积分类型',
  `points_value` DECIMAL(10,4) NOT NULL COMMENT '积分值',
  `calc_method` VARCHAR(16) NOT NULL DEFAULT 'FIXED' COMMENT '计算方式',
  `daily_limit` INT NOT NULL DEFAULT 0 COMMENT '每日上限',
  `monthly_limit` INT NOT NULL DEFAULT 0 COMMENT '每月上限',
  `single_limit` INT NOT NULL DEFAULT 0 COMMENT '单次上限',
  `valid_days` INT NOT NULL DEFAULT 365 COMMENT '有效期(天)',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '规则描述',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级',
  `start_time` DATETIME DEFAULT NULL COMMENT '生效开始',
  `end_time` DATETIME DEFAULT NULL COMMENT '生效结束',
  `extra_config` JSON DEFAULT NULL COMMENT '扩展配置',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_source` (`source`),
  KEY `idx_enabled` (`enabled`),
  KEY `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分规则表';

CREATE TABLE IF NOT EXISTS `points_level` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `level` TINYINT NOT NULL COMMENT '等级',
  `name` VARCHAR(32) NOT NULL COMMENT '等级名称',
  `icon` VARCHAR(32) DEFAULT NULL COMMENT '等级图标',
  `required_points` INT NOT NULL COMMENT '升级所需积分',
  `benefits` JSON DEFAULT NULL COMMENT '等级权益',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '等级描述',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_level` (`level`),
  KEY `idx_required_points` (`required_points`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分等级配置表';

CREATE TABLE IF NOT EXISTS `points_check_in` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `check_in_date` DATE NOT NULL COMMENT '签到日期',
  `points_earned` INT NOT NULL COMMENT '获得积分',
  `consecutive_days` INT NOT NULL DEFAULT 1 COMMENT '连续签到天数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`, `check_in_date`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_check_in_date` (`check_in_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='签到记录表';

CREATE TABLE IF NOT EXISTS `points_user_limit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `rule_code` VARCHAR(32) NOT NULL COMMENT '规则编码',
  `period_type` VARCHAR(16) NOT NULL COMMENT '周期类型',
  `period_key` VARCHAR(16) NOT NULL COMMENT '周期键值',
  `count` INT NOT NULL DEFAULT 0 COMMENT '已使用次数',
  `points` INT NOT NULL DEFAULT 0 COMMENT '已获取积分',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_rule_period` (`user_id`, `rule_code`, `period_type`, `period_key`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_period_key` (`period_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户积分限制记录表';

INSERT IGNORE INTO `points_level` (`level`, `name`, `icon`, `required_points`, `benefits`, `description`, `sort_order`) VALUES
(1, '普通会员', 'bronze', 0, '{}', '注册即为普通会员', 1),
(2, '白银会员', 'silver', 1000, '{"discount": 0.98}', '享98折优惠', 2),
(3, '黄金会员', 'gold', 5000, '{"discount": 0.95, "freeShipping": true}', '享95折+免邮', 3),
(4, '铂金会员', 'platinum', 10000, '{"discount": 0.92, "freeShipping": true, "priorityService": true}', '享92折+免邮+优先客服', 4),
(5, '钻石会员', 'diamond', 50000, '{"discount": 0.88, "freeShipping": true, "priorityService": true, "exclusiveEvents": true}', '享88折+全部权益', 5);

INSERT IGNORE INTO `points_rule` (`name`, `code`, `source`, `points_type`, `points_value`, `calc_method`, `daily_limit`, `monthly_limit`, `single_limit`, `valid_days`, `description`, `enabled`, `priority`) VALUES
('每日签到', 'DAILY_CHECK_IN', 'CHECK_IN', 'GENERAL', 10.0000, 'FIXED', 1, 0, 10, 365, '每日签到获得10积分', 1, 100),
('消费积分', 'CONSUMPTION_REWARD', 'PURCHASE', 'GENERAL', 0.0100, 'RATIO', 0, 0, 1000, 365, '消费1元获得1积分（1%比例）', 1, 90),
('邀请好友', 'INVITE_FRIEND', 'INVITE_FRIEND', 'GENERAL', 100.0000, 'FIXED', 5, 30, 100, 0, '成功邀请一位好友注册获得100积分', 1, 80),
('完成任务', 'COMPLETE_TASK', 'COMPLETE_TASK', 'GENERAL', 50.0000, 'FIXED', 10, 0, 50, 365, '完成指定任务获得50积分', 1, 70),
('评价奖励', 'REVIEW_REWARD', 'REVIEW', 'GENERAL', 20.0000, 'FIXED', 5, 0, 20, 365, '完成商品评价获得20积分', 1, 60),
('分享奖励', 'SHARE_REWARD', 'SHARE', 'GENERAL', 5.0000, 'FIXED', 10, 0, 5, 365, '分享内容获得5积分', 1, 50);
