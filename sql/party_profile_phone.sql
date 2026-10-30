-- ============================================
-- party_profile 手机号迁移（我的信息：查看/换绑手机号）
-- MySQL 8.0+；既有部署在 NAS 手工执行本脚本
-- 新部署直接跑 sql/party_tables.sql 即可（已含下列列），无需本文件
-- 幂等说明：若某列已存在会报 Duplicate column name，忽略该条即可
-- ============================================

ALTER TABLE `party_profile`
  ADD COLUMN `phone` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '绑定手机号' AFTER `avatar_url`;

ALTER TABLE `party_profile`
  ADD COLUMN `phone_verified` TINYINT NOT NULL DEFAULT 0 COMMENT '手机号已验证标记 0/1' AFTER `phone`;

ALTER TABLE `party_profile`
  ADD COLUMN `phone_updated_at` DATETIME DEFAULT NULL COMMENT '最近换绑时间' AFTER `phone_verified`;

-- 验证（phone / phone_verified / phone_updated_at 三列应齐全）：
-- SHOW COLUMNS FROM `party_profile`;
