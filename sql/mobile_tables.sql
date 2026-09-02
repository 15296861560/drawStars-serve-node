-- Mobile platform P0 tables
-- Prefer: pnpm db:sync (prisma db push) after schema.prisma update.
-- This file is for manual/reference DDL on MySQL 5.7+/8.0.

CREATE TABLE IF NOT EXISTS `mobile_module` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `module_code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `icon` varchar(255) NULL DEFAULT NULL,
  `category` varchar(64) NULL DEFAULT NULL,
  `platforms` varchar(255) NULL DEFAULT NULL,
  `status` varchar(32) NULL DEFAULT 'draft',
  `latest_version` varchar(64) NULL DEFAULT NULL,
  `module_url` varchar(512) NULL DEFAULT NULL,
  `app_manage_id` bigint(20) NULL DEFAULT NULL,
  `create_time` bigint(20) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mobile_module_code` (`module_code`),
  KEY `idx_mobile_module_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_module_version` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `module_code` varchar(64) NOT NULL,
  `version` varchar(64) NOT NULL,
  `platforms` varchar(255) NULL DEFAULT NULL,
  `module_url` varchar(512) NULL DEFAULT NULL,
  `file_path` text NULL,
  `checksum` varchar(128) NULL DEFAULT NULL,
  `release_notes` varchar(1000) NULL DEFAULT NULL,
  `force_update` tinyint(1) NULL DEFAULT 0,
  `status` varchar(32) NULL DEFAULT 'draft',
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module_ver` (`module_code`, `version`),
  KEY `idx_module_ver_code` (`module_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_module_permission` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `module_code` varchar(64) NOT NULL,
  `permission_code` varchar(128) NOT NULL,
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mod_perm` (`module_code`, `permission_code`),
  KEY `idx_mod_perm_code` (`module_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_module_install` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `module_code` varchar(64) NOT NULL,
  `version` varchar(64) NULL DEFAULT NULL,
  `platform` varchar(32) NULL DEFAULT NULL,
  `mode` varchar(16) NULL DEFAULT 'soft',
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_mod` (`user_id`, `module_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_shell_release` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `platform` varchar(32) NOT NULL,
  `channel` varchar(64) NULL DEFAULT 'default',
  `version` varchar(64) NOT NULL,
  `build_number` varchar(32) NULL DEFAULT NULL,
  `force_update` tinyint(1) NULL DEFAULT 0,
  `package_url` varchar(512) NULL DEFAULT NULL,
  `release_notes` varchar(1000) NULL DEFAULT NULL,
  `status` varchar(32) NULL DEFAULT 'published',
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_shell_plat` (`platform`, `channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_module_ticket` (
  `ticket` varchar(64) NOT NULL,
  `user_id` bigint(20) NULL DEFAULT NULL,
  `module_code` varchar(64) NOT NULL,
  `platform` varchar(32) NULL DEFAULT NULL,
  `expire_at` bigint(20) NOT NULL,
  `used` tinyint(1) NULL DEFAULT 0,
  PRIMARY KEY (`ticket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_feedback` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NULL DEFAULT NULL,
  `content` text NOT NULL,
  `contact` varchar(128) NULL DEFAULT NULL,
  `diagnostics_json` text NULL,
  `status` varchar(32) NULL DEFAULT 'open',
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_ops_banner` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `title` varchar(128) NOT NULL,
  `image_url` varchar(512) NULL DEFAULT NULL,
  `link` varchar(512) NULL DEFAULT NULL,
  `platforms` varchar(255) NULL DEFAULT NULL,
  `role_codes` varchar(255) NULL DEFAULT NULL,
  `sort` int(11) NULL DEFAULT 0,
  `status` varchar(32) NULL DEFAULT 'published',
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_preview_token` (
  `token` varchar(64) NOT NULL,
  `module_code` varchar(64) NOT NULL,
  `module_url` varchar(512) NOT NULL,
  `name` varchar(128) NULL DEFAULT NULL,
  `expire_at` bigint(20) NOT NULL,
  `create_by` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_debug_whitelist` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `pattern` varchar(512) NOT NULL,
  `remark` varchar(255) NULL DEFAULT NULL,
  `status` tinyint(1) NULL DEFAULT 1,
  `create_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_push_device` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NULL DEFAULT NULL,
  `token` varchar(255) NOT NULL,
  `channel` varchar(64) NULL DEFAULT NULL,
  `platform` varchar(32) NULL DEFAULT NULL,
  `shell_version` varchar(32) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_token` (`user_id`, `token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_push_pref` (
  `user_id` bigint(20) NOT NULL,
  `enable` tinyint(1) NULL DEFAULT 1,
  `categories` varchar(512) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mobile_faq` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `sort` int(11) NULL DEFAULT 0,
  `status` varchar(32) NULL DEFAULT 'published',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extend app_manage / sys_menu via prisma db push (recommended).
-- Manual ALTER examples (run once if columns missing):
-- ALTER TABLE app_manage ADD COLUMN module_code varchar(64) NULL;
-- ALTER TABLE app_manage ADD COLUMN platforms varchar(255) NULL;
-- ALTER TABLE app_manage ADD COLUMN module_url varchar(512) NULL;
-- ALTER TABLE app_manage ADD COLUMN checksum varchar(128) NULL;
-- ALTER TABLE app_manage ADD COLUMN release_notes varchar(1000) NULL;
-- ALTER TABLE app_manage ADD COLUMN force_update tinyint(1) NULL DEFAULT 0;
-- ALTER TABLE app_manage ADD COLUMN min_shell_version varchar(32) NULL;
-- ALTER TABLE sys_menu ADD COLUMN client varchar(32) NULL DEFAULT 'pc';
-- ALTER TABLE sys_menu ADD COLUMN module_code varchar(64) NULL;
