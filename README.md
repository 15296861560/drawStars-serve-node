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

# 开发（热重载）
pnpm dev

# 生产构建与运行
pnpm build
pnpm serve
```

未设置 `DATABASE_URL` 时，会自动根据 `src/config/publish-config.ts` 中的 MySQL 配置拼接连接串。

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
