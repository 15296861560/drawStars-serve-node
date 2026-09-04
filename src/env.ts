import config, { buildDatabaseUrl } from './config/publish-config'

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = buildDatabaseUrl(config.mysql)
}
