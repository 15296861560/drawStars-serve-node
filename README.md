# drawStars-serve-node

drawStars 后端（Node + TypeScript + Prisma）

## 技术栈

- **TypeScript** — 源码在 `src/`
- **Prisma** — 替代原 `mysql2` 连接池与手写 SQL 封装
- **Express** — HTTP API（路由与端口未变）

## 快速开始

```bash
# 安装依赖（首次需生成 Prisma Client）
pnpm install
npx prisma generate

# 可选：复制并编辑数据库连接
cp .env.example .env

# 开发（改 schema 后先停服务，再 prisma generate / db push，然后 dev）
pnpm dev

# 需要重新生成 Prisma Client 时用（请先停止正在运行的 node 服务，避免 Windows EPERM）
pnpm build
# 或仅生成 Client：pnpm prisma:generate

# 生产构建与运行
pnpm build
pnpm serve
```

未设置 `DATABASE_URL` 时，会自动根据 `src/config/publish-config.ts` 中的 MySQL 配置拼接连接串。

### AI 助手

1. 同步表结构（需 `.env` 中 `DATABASE_URL`，或与本机 `publish-config` MySQL 一致）：
   ```bash
   cp .env.example .env   # 首次
   pnpm db:sync
   ```
   若报 `ai_conversation does not exist`，说明尚未执行上一步。
2. 在 `app_info` 配置 `openai`（API Key / 模型 / Base URL）与 `ai_assistant`（系统提示词、上传大小）；百度 `baidu_translate` / `baidu_map` 同上
3. 接口：`/ai-assistant/conversations`、`/ai-assistant/chat`、`/ai-assistant/chat/stream`（SSE）、`/ai-assistant/upload`
4. 前端 `.env`：`VITE_AI_ASSISTANT_MOCK=false`、`VITE_AI_ASSISTANT_STREAM=true`（默认开启流式）

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/db-serve.ts` | 服务入口 |
| `src/routers/` | API 路由 |
| `src/public/` | 业务服务、Provider、Redis 封装 |
| `prisma/schema.prisma` | 数据模型（与 `sql/draw_stars.sql` 对齐） |
| `public/agora/`、`public/baidu/` | 遗留 CommonJS 工具（Agora Token、MD5） |
| `public/compress/` | Webpack 压缩子项目 |

## 数据库

```bash
# 从现有库拉取 schema（可选）
npx prisma db pull

# 或按 sql 文件手动建库后
npx prisma generate
```

## 脚本

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 开发模式 `tsx watch` |
| `pnpm build` | `prisma generate` + `tsc` → `dist/` |
| `pnpm serve` | 生产环境运行 `dist/db-serve.js` |
