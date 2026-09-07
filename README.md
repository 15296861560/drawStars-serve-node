# drawStars-serve-node

drawStars 后端服务，基于 **NestJS + Express + Prisma + MySQL + Redis**，集成 GraphQL、WebSocket（IM 实时通信）、AI 助手等能力。

## 技术栈

| 分类 | 技术 |
| ------ | ------ |
| 运行时 | Node.js >= 18、TypeScript（`tsc` 编译到 `dist/`） |
| 框架 | NestJS（Express 适配器）、GraphQL（Apollo Server） |
| 数据库 | MySQL + Prisma ORM（`@prisma/client`） |
| 缓存/实时 | Redis（`redis` v4）、WebSocket（`ws`） |
| AI | LangChain + OpenAI 兼容接口（流式 SSE） |
| 部署 | Docker 多阶段构建、GitHub Actions → GHCR、docker-compose（NAS） |

## 快速开始

```bash
# 1. 安装依赖（postinstall 会自动 prisma generate）
pnpm install

# 2. 配置环境变量
cp .env.example .env
#   未设 DATABASE_URL 时，会按 src/config/publish-config.ts 中的 MYSQL_* 自动拼接

# 3. 同步数据库表结构
pnpm db:sync            # prisma db push

# 4. 开发运行
pnpm dev                # tsc && node dist/main.js

# 生产构建与运行
pnpm build              # prisma generate && tsc → dist/
pnpm serve              # NODE_ENV=production node dist/main.js
```

> **Windows 注意**：重新生成 Prisma Client（`prisma generate`）前请先停止正在运行的 node 服务，避免 EPERM 锁文件错误。

## 环境变量

完整列表见 [`.env.example`](.env.example)，核心项：

| 变量 | 说明 | 默认值（release） |
| ------ | ------ | ------------------- |
| `DATABASE_URL` | Prisma 连接串，留空则按 `MYSQL_*` 拼接 | — |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | MySQL 连接信息 | `localhost` / `3306` / `drawStars` / `Admin_123` / `draw_stars` |
| `REDIS_HOST` / `REDIS_PORT` | Redis 地址 | `127.0.0.1` / `6379` |
| `SERVE_PORT` | HTTP API 端口 | `8010`（dev `8011`） |
| `WS_PORT` | WebSocket 端口 | `8020`（dev `8021`） |
| `NOTIFY_PORT` | 通知服务端口 | `8030`（dev `8031`） |
| `IM_WS_PORT` | IM WebSocket 端口 | `8040`（dev `8041`） |
| `UPLOAD_DIR` | 文件上传目录 | 项目根 `uploadDir` |
| `TOKEN_VERIFY` | 是否开启接口 token 校验 | `false`（关闭） |
| `NODE_ENV` | `production` 时使用 release 配置 | — |

## 脚本命令

| 命令 | 作用 |
| ------ | ------ |
| `pnpm dev` | 编译并运行（`tsc && node dist/main.js`） |
| `pnpm build` | `prisma generate` + `tsc` → `dist/` |
| `pnpm serve` | 生产环境运行（`NODE_ENV=production`） |
| `pnpm typecheck` | 类型检查（`tsc --noEmit`） |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |
| `pnpm format` / `pnpm prettier` | Prettier 格式化 |
| `pnpm prisma:generate` | 生成 Prisma Client |
| `pnpm db:sync` / `pnpm prisma:push` | 同步 schema 到数据库（`prisma db push`） |
| `pnpm prisma:studio` | 打开 Prisma Studio 可视化管理 |
| `pnpm prisma:seed-rbac` | 写入 RBAC 种子数据 |
| `pnpm prisma:rbac-tables` | 执行 `sql/rbac_tables.sql` |
| `pnpm prisma:app-manage-table` | 执行 `sql/app_manage.sql` |
| `pnpm prisma:points-tables` | 执行 `sql/points_tables.sql` |
| `pnpm prisma:task-tables` | 执行 `sql/task_tables.sql` |
| `pnpm prisma:mobile-tables` | 执行 `sql/mobile_tables.sql` |
| `pnpm migrate:mobile-modules` | 迁移 app-manage 数据到 mobile 表 |

## 目录结构

```
drawStars-serve-node/
├── src/
│   ├── main.ts                    # NestJS 启动入口
│   ├── env.ts                     # DATABASE_URL 兜底拼接
│   ├── nest/
│   │   ├── app.module.ts          # 根模块
│   │   ├── common/                # 装饰器、守卫、拦截器、异常过滤器
│   │   ├── prisma/                # PrismaService 封装
│   │   └── modules/               # 业务模块
│   │       ├── ai-assistant/      # AI 助手（LangChain + OpenAI，SSE 流式）
│   │       ├── analytics/         # 数据分析
│   │       ├── auth/              # 认证
│   │       ├── im/                # 即时通讯（WebSocket，会话/群组/好友/房间）
│   │       ├── logs/              # 操作日志
│   │       ├── misc/              # 杂项（Agora、高德、百度、支付、通知、翻译…）
│   │       ├── mobile/            # 移动端接口
│   │       ├── mysql/             # 通用 SQL 查询
│   │       ├── points/            # 积分系统
│   │       ├── rbac/              # 角色权限（用户/角色/菜单）
│   │       ├── survey/            # 问卷（模板/填写/评分/统计）
│   │       ├── task/              # 任务系统
│   │       └── users/             # 用户资料（含 GraphQL Resolver）
│   ├── public/                    # 业务服务、Provider、Redis、WS Server
│   ├── lib/                       # 共享工具（api-response、prisma、serialize…）
│   ├── config/                    # publish-config、redis-config
│   └── types/                     # 全局类型声明
├── prisma/
│   ├── schema.prisma              # 数据模型
│   └── seed-rbac.ts               # RBAC 种子脚本
├── sql/                           # 建表 SQL（与 Prisma schema 对齐）
├── public/                        # 遗留 CommonJS 工具（Agora Token、百度 MD5、压缩子项目）
├── deploy/                        # Docker 部署（docker-compose.yml + .env.example）
├── scripts/                       # 一次性迁移脚本
├── .github/workflows/             # CI（Docker 构建推送、Gitee 同步）
├── Dockerfile                     # 多阶段构建
├── .env.example                   # 环境变量模板
└── package.json
```

## 数据库

```bash
# 方式一：Prisma 同步（推荐）
pnpm db:sync

# 方式二：手动执行 sql/ 下的建表脚本，再生成 Client
pnpm prisma:generate

# 可视化管理
pnpm prisma:studio
```

数据模型定义在 [`prisma/schema.prisma`](prisma/schema.prisma)，与 [`sql/`](sql/) 下的 SQL 文件对齐。

## AI 助手

集成 LangChain + OpenAI 兼容接口，支持流式 SSE 响应。

1. **同步表结构**：`pnpm db:sync`（若报 `ai_conversation does not exist` 说明未执行）
2. **配置密钥**：在 `app_info` 表写入配置（勿写入 `.env`）

   | app_name | app_id | app_certificate | app_version |
   |----------|--------|-----------------|-------------|
   | `openai` | 模型名（如 `gpt-4o-mini`） | API Key（`sk-...`） | OpenAI 兼容 Base URL（可选） |
   | `ai_assistant` | 上传大小上限 MB（默认 `10`） | 系统提示词（可选） | — |

   ```sql
   INSERT INTO app_info (app_name, app_id, app_certificate, app_version)
   VALUES ('openai', 'gpt-4o-mini', 'sk-your-key', 'https://api.openai.com/v1');
   INSERT INTO app_info (app_name, app_id, app_certificate)
   VALUES ('ai_assistant', '10', '你是 DrawStars 助手…');
   ```

3. **接口**：`/ai-assistant/conversations`、`/ai-assistant/chat`、`/ai-assistant/chat/stream`（SSE）、`/ai-assistant/upload`
4. **前端配置**：`VITE_AI_ASSISTANT_MOCK=false`、`VITE_AI_ASSISTANT_STREAM=true`

## Docker 部署

### 构建镜像

```bash
docker build -t drawstars-api .
```

Dockerfile 采用多阶段构建，最终镜像基于 `node:22-alpine`，暴露 `8010 8020 8030`。

### docker-compose（NAS 部署）

部署配置在 [`deploy/`](deploy/)，支持两种 MySQL 模式：

- **external**（默认）— 直连已有 MySQL，不启动容器 MySQL
- **bundled** — 随 stack 一起部署 MySQL 容器（需 `COMPOSE_PROFILES=with-mysql`）

```bash
cd deploy
cp .env.example .env
# 编辑 .env 填写 MySQL / Redis / 端口等
docker compose up -d                          # external 模式
docker compose --profile with-mysql up -d     # bundled 模式
```

服务组成：`api`（后端）、`web`（前端）、`redis`、`mysql`（可选）。

### CI/CD

GitHub Actions（[`.github/workflows/docker-deploy.yml`](.github/workflows/docker-deploy.yml)）在 push 到 `master`/`develop` 时自动构建 `amd64` + `arm64` 镜像并推送到 GHCR：`ghcr.io/15296861560/drawstars-api:latest`。

## 核心模块说明

| 模块 | 说明 |
| ------ | ------ |
| **auth** | 登录认证（短信、GitHub OAuth），全局 `AuthGuard` 守卫 |
| **rbac** | 角色权限管理（用户/角色/菜单），`@Permissions` 装饰器鉴权 |
| **im** | 即时通讯：WebSocket 网关、会话/消息、群组/房间、好友/黑名单、加入申请、内容审核、在线状态 |
| **ai-assistant** | AI 对话（多轮会话、流式 SSE、文件上传），LangChain + OpenAI |
| **survey** | 问卷系统：模板管理、填写、自动评分、统计 |
| **points** | 积分系统 |
| **task** | 任务系统 |
| **mobile** | 移动端专属接口 |
| **users** | 用户资料（REST + GraphQL Resolver） |
| **misc** | 杂项服务：Agora 音视频 Token、高德地图/天气、百度翻译、支付、通知、资源管理、统计分析 |
| **logs** | 操作日志 |
| **analytics** | 数据分析 |

## 代码规范

- ESLint + Prettier（配置见 [`.eslintrc.cjs`](.eslintrc.cjs)、[`.prettierrc.cjs`](.prettierrc.cjs)）
- `pnpm lint` 检查，`pnpm lint:fix` 自动修复
- `pnpm format` 格式化 `src/`、`prisma/seed-rbac.ts` 等
