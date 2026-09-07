# 积分管理体系（后端）

## 文件

| 路径 | 说明 |
| ------ | ------ |
| `sql/points_tables.sql` | 建表 + 初始等级/规则数据 |
| `prisma/schema.prisma` | Points* Prisma models |
| `src/nest/modules/points/` | Nest 控制器与业务服务 |

## 初始化

```bash
# 1) 执行 SQL（建表 + 种子数据）
pnpm prisma:points-tables

# 或仅用 Prisma 推送表结构（不含种子 INSERT）
pnpm db:sync

# 2) 生成客户端并编译
pnpm prisma:generate
pnpm build
```

## API（前缀 `/api`）

| 方法 | 路径 | 说明 |
| ------ | ------ | ------ |
| GET | `/api/points/account` | 积分账户 |
| GET | `/api/points/transactions` | 交易记录分页 |
| GET | `/api/points/rules` | 规则列表 |
| GET | `/api/points/levels` | 等级配置 |
| GET | `/api/points/statistics` | 统计 |
| POST | `/api/points/check-in` | 每日签到 |
| GET | `/api/points/check-in/status` | 签到状态 |
| POST | `/api/points/operate` | 通用积分操作 |
| GET | `/api/points/calculate-deduction` | 抵扣计算 |

响应格式：`{ status: boolean, msg: string, data: T }`

用户身份优先取 token 中的 `uid`；也可传 `userId` 查询参数/请求体。
