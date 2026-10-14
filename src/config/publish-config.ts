import path from 'path'

export interface MysqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface AppConfig {
  mysql: MysqlConfig
  redis_host: string
  redis_port: number
  serve_port: number
  ws_port: number
  notify_port: number
  im_ws_port: number
  uploadDir?: string
  admin_key: string
}

function envStr(key: string, fallback: string): string {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const num = Number(raw)
  return Number.isFinite(num) ? num : fallback
}

const dev_config: AppConfig = {
  mysql: {
    host: '127.0.0.1',
    port: 3306,
    user: 'drawStars',
    password: 'Admin_123',
    database: 'draw_stars'
  },
  redis_host: '127.0.0.1',
  redis_port: 6379,
  // 各端统一（PRD 7.1/7.2）：SERVE_PORT=8010（dev 8011）/ WS_PORT=8020（dev 8021）
  // party 联调对齐小程序 drawStars-party：API_BASE=http://127.0.0.1:8011 / WS_URL=ws://127.0.0.1:8021
  serve_port: 8011,
  ws_port: 8021,
  notify_port: 8031,
  im_ws_port: 8041,
  uploadDir: path.join(__dirname, '../../uploadDir'),
  admin_key: 'party-admin-dev'
}

/** release 默认；部署时可用环境变量覆盖 */
const release_config: AppConfig = {
  mysql: {
    host: 'localhost',
    port: 3306,
    user: 'drawStars',
    password: 'Admin_123',
    database: 'draw_stars'
  },
  redis_host: '127.0.0.1',
  redis_port: 6379,
  serve_port: 8010,
  ws_port: 8020,
  notify_port: 8030,
  im_ws_port: 8040,
  uploadDir: path.join(__dirname, '../../uploadDir'),
  // TODO(deploy)：上线必换强随机 key（≥32 位），并通过环境变量 PARTY_ADMIN_KEY 覆盖
  admin_key: 'CHANGE_ME_ON_DEPLOY'
}

const base = process.env.NODE_ENV === 'production' ? release_config : dev_config

const config: AppConfig = {
  mysql: {
    host: envStr('MYSQL_HOST', base.mysql.host),
    port: envInt('MYSQL_PORT', base.mysql.port),
    user: envStr('MYSQL_USER', base.mysql.user),
    password: envStr('MYSQL_PASSWORD', base.mysql.password),
    database: envStr('MYSQL_DATABASE', base.mysql.database)
  },
  redis_host: envStr('REDIS_HOST', base.redis_host),
  redis_port: envInt('REDIS_PORT', base.redis_port),
  serve_port: envInt('SERVE_PORT', base.serve_port),
  ws_port: envInt('WS_PORT', base.ws_port),
  notify_port: envInt('NOTIFY_PORT', base.notify_port),
  im_ws_port: envInt('IM_WS_PORT', base.im_ws_port),
  uploadDir: envStr(
    'UPLOAD_DIR',
    base.uploadDir || path.join(__dirname, '../../uploadDir')
  ),
  admin_key: envStr('PARTY_ADMIN_KEY', base.admin_key)
}

export function buildDatabaseUrl(mysql: MysqlConfig): string {
  const encodedPassword = encodeURIComponent(mysql.password)
  return `mysql://${mysql.user}:${encodedPassword}@${mysql.host}:${mysql.port}/${mysql.database}`
}

export default config
