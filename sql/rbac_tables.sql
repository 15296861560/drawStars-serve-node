-- RBAC tables only (safe to run repeatedly with IF NOT EXISTS where supported)

CREATE TABLE IF NOT EXISTS `sys_role`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `code` varchar(64) NOT NULL,
  `remark` varchar(255) NULL DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `sort` int(11) NOT NULL DEFAULT 0,
  `create_time` bigint(20) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sys_role_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sys_menu`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `parent_id` bigint(20) NOT NULL DEFAULT 0,
  `name` varchar(64) NOT NULL,
  `type` tinyint(4) NOT NULL,
  `path` varchar(255) NULL DEFAULT NULL,
  `component` varchar(255) NULL DEFAULT NULL,
  `permission` varchar(128) NULL DEFAULT NULL,
  `icon` varchar(64) NULL DEFAULT NULL,
  `sort` int(11) NOT NULL DEFAULT 0,
  `visible` tinyint(4) NOT NULL DEFAULT 1,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `create_time` bigint(20) NULL DEFAULT NULL,
  `update_time` bigint(20) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sys_menu_parent_id_idx` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sys_user_role`  (
  `user_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  CONSTRAINT `sys_user_role_user_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sys_user_role_role_fk` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sys_role_menu`  (
  `role_id` bigint(20) NOT NULL,
  `menu_id` bigint(20) NOT NULL,
  PRIMARY KEY (`role_id`, `menu_id`),
  CONSTRAINT `sys_role_menu_role_fk` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sys_role_menu_menu_fk` FOREIGN KEY (`menu_id`) REFERENCES `sys_menu` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
