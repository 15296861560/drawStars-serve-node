-- ============================================
-- Task management tables
-- (tables + templates + seed data)
-- MySQL 8.0+ utf8mb4
-- Run: pnpm prisma:task-tables
-- task_no format: {TYPE}{YYYYMMDD}{SEQ4} e.g. DLY202608070001
-- ============================================

CREATE TABLE IF NOT EXISTS `task_category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `parent_id` BIGINT UNSIGNED DEFAULT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_category_code` (`code`),
  KEY `idx_task_category_parent` (`parent_id`),
  KEY `idx_task_category_sort` (`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task category';

CREATE TABLE IF NOT EXISTS `task_def` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_no` VARCHAR(32) NOT NULL COMMENT '任务编号 TYPE+YYYYMMDD+SEQ',
  `title` VARCHAR(128) NOT NULL,
  `description` TEXT,
  `icon` VARCHAR(64) DEFAULT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `task_type` VARCHAR(32) NOT NULL,
  `condition_type` VARCHAR(32) NOT NULL,
  `condition_config` JSON DEFAULT NULL,
  `difficulty` TINYINT NOT NULL DEFAULT 1,
  `tags` JSON DEFAULT NULL,
  `reward_config` JSON NOT NULL,
  `target_count` INT NOT NULL DEFAULT 1,
  `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  `assign_mode` VARCHAR(32) NOT NULL DEFAULT 'PUBLIC',
  `completion_mode` VARCHAR(16) DEFAULT NULL,
  `unlock_mode` VARCHAR(16) DEFAULT NULL,
  `children` JSON DEFAULT NULL,
  `start_time` DATETIME DEFAULT NULL,
  `end_time` DATETIME DEFAULT NULL,
  `daily_limit` INT DEFAULT NULL,
  `total_limit` INT DEFAULT NULL,
  `accept_valid_hours` INT DEFAULT NULL,
  `reject_reason` VARCHAR(255) DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `priority` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_def_no` (`task_no`),
  KEY `idx_task_def_category` (`category_id`),
  KEY `idx_task_def_status` (`status`),
  KEY `idx_task_def_type` (`task_type`),
  KEY `idx_task_def_priority` (`priority`),
  KEY `idx_task_def_creator` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task definition';

CREATE TABLE IF NOT EXISTS `task_instance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
  `current_count` INT NOT NULL DEFAULT 0,
  `target_count` INT NOT NULL DEFAULT 1,
  `reward_claimed` TINYINT NOT NULL DEFAULT 0,
  `accepted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME DEFAULT NULL,
  `expired_at` DATETIME DEFAULT NULL,
  `submit_payload` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_instance_user_task` (`user_id`, `task_id`),
  KEY `idx_task_instance_user` (`user_id`),
  KEY `idx_task_instance_task` (`task_id`),
  KEY `idx_task_instance_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='User task instance';

CREATE TABLE IF NOT EXISTS `task_reward_claim` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `instance_id` BIGINT UNSIGNED NOT NULL,
  `task_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `item_name` VARCHAR(128) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADDRESS',
  `address` JSON DEFAULT NULL,
  `logistics_company` VARCHAR(64) DEFAULT NULL,
  `tracking_no` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_claim_instance_item` (`instance_id`, `item_name`),
  KEY `idx_task_claim_user` (`user_id`),
  KEY `idx_task_claim_task` (`task_id`),
  KEY `idx_task_claim_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Physical reward claim';

CREATE TABLE IF NOT EXISTS `task_notification` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `task_id` BIGINT UNSIGNED DEFAULT NULL,
  `title` VARCHAR(128) NOT NULL,
  `content` VARCHAR(512) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `read` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_notify_user` (`user_id`),
  KEY `idx_task_notify_read` (`read`),
  KEY `idx_task_notify_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task notification';

CREATE TABLE IF NOT EXISTS `task_reward_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `reward_config` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task reward template';

CREATE TABLE IF NOT EXISTS `task_template` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task definition template';

INSERT IGNORE INTO `task_category` (`id`, `name`, `code`, `parent_id`, `sort`) VALUES
(1, '日常任务', 'DAILY', NULL, 1),
(2, '活动任务', 'EVENT', NULL, 2),
(3, '成就任务', 'ACHIEVEMENT', NULL, 3),
(4, '新手任务', 'NOVICE', NULL, 4);

INSERT IGNORE INTO `task_def` (
  `id`, `task_no`, `title`, `description`, `icon`, `category_id`, `task_type`, `condition_type`,
  `condition_config`, `difficulty`, `tags`, `reward_config`, `target_count`, `status`,
  `assign_mode`, `daily_limit`, `priority`, `created_by`, `start_time`, `end_time`, `total_limit`
) VALUES
(1, 'DLY202608070001', '每日签到', '每日登录签到，领取积分与经验奖励', 'calendar', 1, 'DAILY', 'CHECK_IN',
 CAST('{"action":"check_in"}' AS JSON), 1, CAST('["签到","日常"]' AS JSON),
 CAST('{"rewards":[{"type":"POINTS","config":{"amount":10},"description":"10 积分"},{"type":"EXP","config":{"amount":5},"description":"5 经验"}]}' AS JSON),
 1, 'APPROVED', 'PUBLIC', 1, 100, 1, NULL, NULL, NULL),
(2, 'ONC202608070002', '完善个人资料', '完善头像、昵称与个人简介，解锁新手奖励', 'user', 4, 'ONCE', 'CONTENT',
 CAST('{"fields":["avatar","nickname","bio"]}' AS JSON), 1, CAST('["新手","资料"]' AS JSON),
 CAST('{"rewards":[{"type":"POINTS","config":{"amount":50},"description":"50 积分"}]}' AS JSON),
 1, 'APPROVED', 'PUBLIC', NULL, 90, 1, NULL, NULL, NULL),
(3, 'LTD202608070003', '限时分享挑战', '活动期间分享任意内容至社交平台，赢取限定奖励', 'share', 2, 'LIMITED', 'SHARE',
 CAST('{"platforms":["wechat","weibo"],"count":1}' AS JSON), 2, CAST('["限时","分享"]' AS JSON),
 CAST('{"rewards":[{"type":"POINTS","config":{"amount":100},"description":"100 积分"},{"type":"PHYSICAL","config":{"itemName":"限定徽章周边","stock":50},"description":"限定徽章周边"}]}' AS JSON),
 1, 'APPROVED', 'PUBLIC', NULL, 80, 1, '2026-01-01 00:00:00', '2026-12-31 23:59:59', 500),
(4, 'ACH202608070004', '连续签到7天成就', '累计连续签到 7 天，解锁成就徽章与称号', 'trophy', 3, 'ACHIEVEMENT', 'CHECK_IN',
 CAST('{"consecutiveDays":7}' AS JSON), 2, CAST('["成就","签到"]' AS JSON),
 CAST('{"rewards":[{"type":"BADGE","config":{"badge_code":"checkin_7","name":"七日达人"},"description":"七日达人徽章"},{"type":"TITLE","config":{"title":"坚持不懈","style":"gold"},"description":"称号：坚持不懈"},{"type":"POINTS","config":{"amount":200},"description":"200 积分"}]}' AS JSON),
 7, 'APPROVED', 'PUBLIC', NULL, 70, 1, NULL, NULL, NULL);
