-- ============================================
-- 拾星趣局 party 业务 - 数据库表结构
-- MySQL 8.0+（PRD 5.2 / 5.3）
-- 执行: pnpm prisma:party-tables
-- 说明:
--   * 主键统一 VARCHAR(32) ULID（服务端生成），
--     区别于本仓库 BigInt 自增风格，对齐 PRD 装配规范
--   * status 对齐小程序大写形态: WAITING/PLAYING/SETTLING/CLOSED
--   * client_key: 正式 = TOKEN_VERIFY 的 uid; demo = 请求来源 IP
--   * 结算在客户端本地完成、不上传，服务端仅做会话状态机与惰性清扫
--   * 题面/词面/徽章文案/星愿墙种子由服务端代码内嵌
--     (src/nest/modules/party/data/*.js) 提供，本脚本只建表不插种子
-- ============================================

CREATE TABLE IF NOT EXISTS `party_session` (
  `id` VARCHAR(32) NOT NULL COMMENT '会话ID（ULID）',
  `code` VARCHAR(8) NOT NULL COMMENT '6位桌码（剔0/O/1/I）',
  `game_type` VARCHAR(16) NOT NULL COMMENT '游戏类型 tod/draw/lady/bluff/dice',
  `level` VARCHAR(16) NOT NULL DEFAULT 'standard' COMMENT '档位 gentle/standard/starry',
  `theme_tags` JSON NOT NULL COMMENT '主题标签数组',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '总轮数，0=自然终局',
  `current_round` INT NOT NULL DEFAULT 0 COMMENT '当前轮，开局后>=1',
  `player_limit` INT NOT NULL DEFAULT 4 COMMENT '人数上限（2-8）',
  `penalty_mode` VARCHAR(16) NOT NULL DEFAULT 'drink' COMMENT '惩罚模式 drink/points',
  `penalty_text` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '惩罚文案',
  `joker` TINYINT NOT NULL DEFAULT 0 COMMENT 'lady 54张模式 0/1',
  `status` VARCHAR(16) NOT NULL DEFAULT 'WAITING' COMMENT '状态 WAITING/PLAYING/SETTLING/CLOSED',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `started_at` DATETIME DEFAULT NULL COMMENT '开局时间',
  `closed_at` DATETIME DEFAULT NULL COMMENT '关闭时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_status` (`status`),
  KEY `idx_game_type` (`game_type`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星聚局会话表';

CREATE TABLE IF NOT EXISTS `party_session_player` (
  `id` VARCHAR(32) NOT NULL COMMENT '玩家席位ID（ULID）',
  `session_id` VARCHAR(32) NOT NULL COMMENT '所属会话ID',
  `client_key` VARCHAR(64) NOT NULL COMMENT '身份键：uid或内网IP（demo）',
  `name` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '昵称',
  `avatar_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '头像',
  `ready` TINYINT NOT NULL DEFAULT 0 COMMENT '准备态',
  `is_host` TINYINT NOT NULL DEFAULT 0 COMMENT '房主标记',
  `online` TINYINT NOT NULL DEFAULT 1 COMMENT '在线标记',
  `absent` TINYINT NOT NULL DEFAULT 0 COMMENT '离席标记（房主标定）',
  `joined_round` INT NOT NULL DEFAULT 1 COMMENT '起始计分轮（中途归来/加入）',
  `extra` JSON DEFAULT NULL COMMENT '扩展位（strong start等）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入座时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_client` (`session_id`, `client_key`),
  KEY `idx_client_key` (`client_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星聚局玩家席位表';

CREATE TABLE IF NOT EXISTS `party_round` (
  `id` VARCHAR(32) NOT NULL COMMENT '轮次记录ID（ULID）',
  `session_id` VARCHAR(32) NOT NULL COMMENT '所属会话ID',
  `round_no` INT NOT NULL COMMENT '轮次号（从1起）',
  `data` JSON DEFAULT NULL COMMENT '轮次数据（预留迁移位）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_round` (`session_id`, `round_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星聚局轮次记录表（占位）';

CREATE TABLE IF NOT EXISTS `party_card` (
  `id` VARCHAR(32) NOT NULL COMMENT '纪念卡ID，约定 card_<sessionId>',
  `session_id` VARCHAR(32) NOT NULL COMMENT '所属会话ID',
  `data` JSON NOT NULL COMMENT '纪念卡JSON（与小程序 mockCard 同形）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拾星纪念卡表（占位，miss时即时生成骨架卡）';

CREATE TABLE IF NOT EXISTS `party_question` (
  `id` VARCHAR(32) NOT NULL COMMENT '题目ID（ULID）',
  `game_type` VARCHAR(16) NOT NULL COMMENT '游戏类型',
  `kind` VARCHAR(16) NOT NULL COMMENT '类型 truth/dare',
  `level` VARCHAR(16) NOT NULL COMMENT '档位 gentle/standard/starry',
  `themes` JSON NOT NULL COMMENT '适用主题',
  `text` VARCHAR(512) NOT NULL COMMENT '题面',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_game_level` (`game_type`, `level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='真心话大冒险题库表（占位，现由data/tod.js供题）';

CREATE TABLE IF NOT EXISTS `party_wordbank` (
  `id` VARCHAR(32) NOT NULL COMMENT '词条ID（ULID）',
  `level` VARCHAR(16) NOT NULL COMMENT '档位',
  `theme` VARCHAR(16) NOT NULL COMMENT '主题',
  `word` VARCHAR(64) NOT NULL COMMENT '词面',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_level_theme` (`level`, `theme`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='你画我猜词库表（占位，现由data/draw-words.js供词）';

CREATE TABLE IF NOT EXISTS `star_wish` (
  `id` VARCHAR(32) NOT NULL COMMENT '星愿ID（ULID）',
  `client_key` VARCHAR(64) NOT NULL COMMENT '身份键：一人一愿',
  `text` VARCHAR(120) NOT NULL COMMENT '星愿文本（<=40字）',
  `theme` VARCHAR(16) NOT NULL DEFAULT '愿望' COMMENT '主题（七选一）',
  `updated_at` DATETIME NOT NULL COMMENT '最近一次写入时间（回包转毫秒）',
  `update_key` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '日限键 YYYYMMDD（每日限改1次）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_client_key` (`client_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户星愿表';

CREATE TABLE IF NOT EXISTS `star_wish_like` (
  `id` VARCHAR(32) NOT NULL COMMENT '点赞ID（ULID）',
  `wish_id` VARCHAR(64) NOT NULL COMMENT '被点亮的星：墙条目id或星愿id',
  `client_key` VARCHAR(64) NOT NULL COMMENT '点亮者身份键',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点亮时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wish_client` (`wish_id`, `client_key`),
  KEY `idx_client_key` (`client_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星愿墙点赞表（liked去重+计数）';

CREATE TABLE IF NOT EXISTS `party_profile` (
  `id` VARCHAR(32) NOT NULL COMMENT '档案ID（ULID）',
  `client_key` VARCHAR(64) NOT NULL COMMENT '身份键',
  `name` VARCHAR(32) NOT NULL DEFAULT '星河旅人' COMMENT '昵称',
  `avatar_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '头像',
  `star_val` INT NOT NULL DEFAULT 0 COMMENT '星光值（结算在客户端本地，服务端诚实0值）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_client_key` (`client_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星聚档案表（星光本位）';

CREATE TABLE IF NOT EXISTS `party_badge` (
  `id` VARCHAR(32) NOT NULL COMMENT '徽章ID（ULID）',
  `key` VARCHAR(32) NOT NULL COMMENT '徽章键（12枚，见 constants BADGES）',
  `emoji` VARCHAR(16) NOT NULL COMMENT '徽章表情',
  `label` VARCHAR(32) NOT NULL COMMENT '徽章名',
  `condition` VARCHAR(255) NOT NULL COMMENT '解锁条件文案',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='徽章种子表（占位，现由data/constants.js推导下发）';
