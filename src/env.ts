import * as fs from 'fs'
import * as path from 'path'

// 环境变量优先级：进程环境变量 > .env > publish-config 代码兜底
// 注意：下方 publish-config 的 import 必须位于本段 .env 解析之后（CommonJS 按序 require），
// 否则 DATABASE_URL 会被兜底值提前占用，而 Prisma 客户端后续加载 .env 时不会覆盖已存在的变量，
// 后端将始终连接 publish-config 的兜底库，.env 中指定的数据库被静默忽略
try {
  const envPath = path.resolve(__dirname, '../.env')
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
} catch {
  // .env 解析失败时静默降级，走下方兜底逻辑
}

import config, { buildDatabaseUrl } from './config/publish-config'

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = buildDatabaseUrl(config.mysql)
}
