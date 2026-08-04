CREATE TABLE IF NOT EXISTS `app_manage` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `description` varchar(500) NULL DEFAULT NULL,
  `version` varchar(64) NULL DEFAULT NULL,
  `status` varchar(32) NULL DEFAULT 'draft',
  `icon` varchar(255) NULL DEFAULT NULL,
  `category` varchar(64) NULL DEFAULT NULL,
  `file_path` text NULL,
  `create_time` bigint(20) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `app_manage_name_idx` (`name`),
  KEY `app_manage_status_idx` (`status`),
  KEY `app_manage_category_idx` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
