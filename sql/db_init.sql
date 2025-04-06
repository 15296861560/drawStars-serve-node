-- 登录日志表
CREATE TABLE IF NOT EXISTS login_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL COMMENT '用户名',
  ip VARCHAR(50) NOT NULL COMMENT 'IP地址',
  location VARCHAR(100) COMMENT '登录地点',
  browser VARCHAR(100) COMMENT '浏览器类型',
  os VARCHAR(50) COMMENT '操作系统',
  status VARCHAR(20) NOT NULL COMMENT '状态: success/fail',
  msg TEXT COMMENT '详细信息',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_username (username),
  INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户登录日志表';

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL COMMENT '操作用户',
  operation VARCHAR(20) NOT NULL COMMENT '操作类型: insert/update/delete/select',
  method VARCHAR(10) NOT NULL COMMENT '请求方法',
  params TEXT COMMENT '请求参数',
  ip VARCHAR(50) NOT NULL COMMENT 'IP地址',
  status VARCHAR(20) NOT NULL COMMENT '状态: success/fail',
  error_msg TEXT COMMENT '错误信息',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_username (username),
  INDEX idx_operation (operation),
  INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统操作日志表';

-- 业务日志表
CREATE TABLE IF NOT EXISTS business_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(50) NOT NULL COMMENT '业务模块',
  type VARCHAR(20) NOT NULL COMMENT '日志类型: business/system/error',
  title VARCHAR(100) NOT NULL COMMENT '日志标题',
  content TEXT NOT NULL COMMENT '日志内容',
  operator VARCHAR(50) NOT NULL COMMENT '操作人',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_module (module),
  INDEX idx_type (type),
  INDEX idx_operator (operator),
  INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务日志表';