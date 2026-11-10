# 心智测评系统（问星）后端落地规格 v1.0

> 依据：`drawStars-Vue3/prd/心智测评系统_PRD_v1.0.md`、`drawStars-Vue3/database/assessment_tables.sql`、
> `drawStars-Vue3/src/api/assessment.ts`、`drawStars-Vue3/src/types/assessment.ts`
> 目标仓库：`drawStars-serve-node`（NestJS + Prisma + MySQL）

## 1. 范围

实现前端已完成的 21 个真实接口（`/assessmentApi/*` + `/loginApi/quickRegister`），
覆盖公众号配置、测评上架、渠道入口、回复规则、C 端广场/引导/埋点/报告/注册/积分、数据看板。

不在本次范围：PRD 4.9/4.10（v1.1+）、E10 follow_scan 的公众号回调（仅保留事件类型枚举与落表能力）、
微信服务号菜单/自动回复的官方 API 同步（回复规则仍为「人工复制到公众号后台」模式）。

## 2. 数据模型

新增 Prisma model（均追加到 `prisma/schema.prisma` 末尾，命名与现有风格一致）：

| Model | 表名 | 关键说明 |
|---|---|---|
| `AssessmentOaConfig` | `assessment_oa_config` | 单行表，id=1；`guideEnabled` TINYINT→Int |
| `AssessmentReplyRule` | `assessment_reply_rule` | `keywords/replyContent`、`syncStatus` pending/synced |
| `AssessmentChannel` | `assessment_channel` | `@@unique([source, refId], map:"uniq_source_ref")` |
| `AssessmentInfo` | `assessment_info` | status 0草稿/1上架/2下架 |
| `AssessmentEvent` | `assessment_event` | 埋点中心，额外增加 `surveyId BigInt? @map("survey_id")`（E02/E03 归因与看板 Top 需要，原 DDL 注释遗漏） |

同时新增 `sql/assessment_tables.sql`：5 表 DDL（含 `survey_id` 列）+ `points_rule` 三条种子 +
`points_transaction` 幂等唯一键 `uniq_rule_ref(rule_code 不存在时改用 source, reference_type, reference_id)`。

## 3. 接口契约

### 3.1 C 端（`@Public()`，无需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/assessmentApi/plaza/list` | 仅 status=1；支持 `typeKey`（all/hot/new/具体类型）、`page`、`pageSize`；返回 `{list,total}`；每项补 `shareCode`（由 `survey_publish_config` 解析） |
| GET | `/assessmentApi/guide/config` | 读取 `assessment_oa_config` id=1，映射为 `GuideConfig`（result/complete 缺省回退 `guideTitle/guideDesc`） |
| POST | `/assessmentApi/event/report` | 埋点上报，返回 `{eventId}`；防刷见 §4 |
| GET | `/assessmentApi/report/:responseId` | 报告聚合，见 §5；无记录返回 `null` |
| POST | `/assessmentApi/points/claim` | 场景 B 补领校验/补发；body `{scenario,responseId}` |
| POST | `/assessmentApi/points/grant` | 场景 A/C 发放；body `{scenario,responseId?,eventId?}` |

### 3.2 登录扩展

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/loginApi/quickRegister` | body `{phone,captcha,nickname?,pointsScenario?,source?,refId?,responseId?,responseIds?[]}`；返回 `{token,isNewUser,grantedPoints,pointsDetail,user:{id,name,phone}}`；实现位置：`AuthController`，注入 `AssessmentService` |

### 3.3 管理端（`PermissionsGuard` + 权限码）

| 方法 | 路径 | 权限码 |
|---|---|---|
| GET/PUT | `/assessmentApi/oa/config` | `assessment:oa:list` / `assessment:oa:manage` |
| GET | `/assessmentApi/info/list` | `assessment:info:list` |
| POST | `/assessmentApi/info` | `assessment:info:manage` |
| PUT | `/assessmentApi/info/:id` | `assessment:info:manage`（若记录已上架且请求未显式带 status，则强制置 2 下架，符合 4.1.4） |
| POST | `/assessmentApi/info/:id/publish` | `assessment:info:manage`（四项上架校验，见 §6） |
| POST | `/assessmentApi/info/:id/unpublish` | `assessment:info:manage` |
| DELETE | `/assessmentApi/info/:id` | `assessment:info:manage`（**新增**，前端 `deleteInfo` 补上） |
| GET | `/assessmentApi/channel/list` | `assessment:channel:list` |
| POST/PUT/DELETE | `/assessmentApi/channel`、`/channel/:id` | `assessment:channel:manage` |
| GET | `/assessmentApi/reply/list` | `assessment:reply:list` |
| POST/PUT/DELETE | `/assessmentApi/reply`、`/reply/:id` | `assessment:reply:manage` |
| GET | `/assessmentApi/stats/overview?days=30` | `assessment:stats:view` |

返回体统一 `{status:true,msg:'ok',data}`（与现有 Points/Survey 控制器一致，由全局 ResponseInterceptor 兜底）。

## 4. 埋点防刷（PRD 4.6.3）

`AssessmentEventService.report(payload, meta)` 顺序执行：

1. `eventType` 必须属于 E01–E10 白名单，否则 400。
2. `sessionId` 必填，长度 ≤64；缺失则 400。
3. E01 `channel_visit`：`source` 必须命中 `article|keyword|welcome|menu|share` 白名单，`refId` 必填且 ≤32；
   同 `sessionId+source+refId` 在 5 分钟窗口内已存在则**只返回已有 eventId，不再落库**（去重）。
4. 频率限制：同一 `sessionId` 60 秒内计数 ≥60 则丢弃（返回 `{eventId:0}`，并 `console.warn` 记日志）。
   计数用进程内 Map（sessionId → 时间戳数组），定期裁剪。
5. 落库：`created_day` 取本地日期（YYYY-MM-DD 的 Date）；`userAgent` 截断 255；`userId` 支持 token 或 body；
   `ipCity` 暂留空（不存原文 IP）。

## 5. 报告聚合（PRD 4.2）

`AssessmentReportService.build(responseId)`：

1. 查 `survey_response`（status=submitted）+ `survey` + `answers` + `scoringResult`；
   查 `assessment_info` by surveyId 得到 `typeKey/infoTitle`；无 info 时 typeKey 回退 `archetype`。
2. **维度得分（优先按选项配置）**：遍历答案，解析 `answerData` 为选项 id（单值/数组/`{value}`），
   在 `survey_option.config` 中读取 `{dim, pts, score}`：
   - `dim` 聚合累加 `pts ?? 1`；
   - `max` = 各题该 dim 选项最大 pts 之和（避免固定 9/8 与真实问卷不符）；
   - `percent = round(score/max*100)`，结果按 score 降序。
3. **回退**：无 `dim` 配置时使用 `scoringResult.detail.dimensions`（name/score/maxScore），key 取 name。
4. **M0（quick_daily）**：`totalScore` 取选项 `config.score`（缺省用 scoringResult.totalScore）；按
   `M0_GRADE_MAP` 取 min 档位，输出 `resultTitle/gradeLabel/gradeColor/summaryText/isPassed=null`。
5. **M1（archetype）**：取最高维映射 `M1_DIMENSIONS`（8 型），输出 `brightSide/blindSide/adviceText/gradeLabel`。
6. **M2（emotion）**：最高维 + 最低维，`summaryText = 高维 highText + 低维 lowText`；
   画像标题用 `M2_PROFILE_TITLES[hash(responseId) % 4]`（确定性）。
7. 公共字段：`responseNo = YYMMDD-#####`（hash(responseId)%100000）、`completedAt`、
   `fillUrl = ${ASSESSMENT_H5_ORIGIN || ''}/survey/fill/{shareCode}`、`judgeModel` 由 typeKey 注册表给出。
8. 常量（类型库、M0/M1/M2、积分值）落到 `assessment.constants.ts`，与前端 `assessment-registry.ts` 保持一致。

## 6. 上架校验（PRD 4.1.4）

`publish` 前校验，任一失败 400：

1. 关联 `survey` 存在且 `status='published'`、有 `publish_config.shareCode`；
2. `questionNum > 0`（为 0 时用 survey 题目数回填）；
3. `title` 非空；
4. `typeKey` 命中 10 型注册表。

通过后 `status=1`，`published_at` 仅在首次上架时写入。

## 7. 积分（PRD 4.8）

`AssessmentPointsService`：

- `grant(scenario, {responseId,eventId}, userId)`：
  - 幂等键：`ASSESSMENT_COMPLETE → referenceType='survey_response', referenceId=responseId`；
    `ASSESSMENT_POSTER → referenceType='assessment_event', referenceId=eventId`；
    `REGISTER_WELCOME → referenceType='user', referenceId=userId`。
  - 先查 `points_transaction` 是否已存在同 `source='assessment'+referenceType+referenceId` 的 COMPLETED 流水，
    存在则返回 `{granted:false,points:0,reason:'已领取过',pointsDetail:[]}`。
  - 调 `PointsService.operatePoints({ userId, points, source:'assessment', referenceId, referenceType,
    ruleCode: scenario, description, immediate:true })`；规则不存在时按常量兜底积分值。
  - `claim(scenario,responseId)`：已发放 → `{claimed:true,grantedPoints:已发,pointsDetail:[已发]}`；
    未发放则校验 responseId 归属（可为游客答卷）后发放，返回 `{claimed:false,grantedPoints,pointsDetail}`。
- 积分规则种子：ASSESSMENT_COMPLETE 5（日2/月30）、ASSESSMENT_POSTER 5（日3/月20）、
  REGISTER_WELCOME 20（singleLimit 1，终身一次）。

## 8. 快捷注册（PRD 5.6.2）

`AssessmentService.quickRegister(body)`：

1. 手机号 `/^1\d{10}$/` 校验；验证码用 `UsersService.verifyCaptcha(phone, captcha, 'login')`，
   失败再试 `'register'`；均失败抛「验证码错误」。
2. `userService.queryUserByPhone(phone)`：
   - 已存在 → `isNewUser=false`，`userService.setToken` 生成 token；
   - 不存在 → 走 `userService.registerByPhone({name: nickname||星友后4位, phone, ...})` 后 `setToken`。
3. 新用户：发放 `REGISTER_WELCOME`（幂等键 user/id）。
4. 游客答卷迁移：`responseIds` 去重后，仅当 `response.userId IS NULL` 时 update 为当前 userId；
   逐份幂等发放 `ASSESSMENT_COMPLETE`。
5. 返回 token + `grantedPoints/pointsDetail`；任一步失败整体抛错（注册本身不回滚，与现有注册行为一致）。

## 9. 数据看板

`statsOverview(days)` 按近 N 天 `assessment_event` 聚合，口径与前端 mock 对齐：

- 漏斗：E01（session+source+refId 去重）/ E02 / E03 / E04 / E05(isNewUser) / 积分发放数 / 分享(E08+E09)；
- 渠道透视：5 个 source 的 visits/completes/registers/posters + completeRate；
- 趋势：逐日 e01/e03/e05；
- 注册：show/success/new/rate；
- 积分：complete/poster/welcome 笔数、totalPoints（查 points_transaction）、grantRate、claimable（游客 E03 数）、claimCount；
- Top 测评：按 surveyId 聚合 E03，附带 E02 的 refId=infoId 点击数。

## 10. 前端配套改动

`drawStars-Vue3/src/api/assessment.ts`：

- 新增 `deleteInfo(id)` → `DELETE /api/assessmentApi/info/${id}`（mock 分支同步删除）。
- mock 服务补 `mockDeleteInfo`。
- 不改任何页面业务逻辑。

## 11. 验证步骤

1. `cd drawStars-serve-node && npx prisma generate`
2. `npx tsc --noEmit -p tsconfig.json`（或 `npm run build`）通过
3. 启动 `npm run start:dev`，curl 冒烟：
   - `GET /assessmentApi/plaza/list`、`GET /assessmentApi/guide/config` 返回 200 且 data 结构正确
   - `POST /assessmentApi/event/report` 两次相同 session+source+refId → 第二次 eventId 相同/不新增
   - 非法 source → 400
   - `GET /assessmentApi/report/{已提交 responseId}` 返回对应 judgeModel 报告
4. 前端 `VITE_ASSESSMENT_MOCK=false` 启动，走查广场→填写→报告→海报→注册→管理端五页。
5. 数据库校验：`assessment_event` 有落表、`points_transaction` 同幂等键仅一条。

## 12. 关键决策与风险

- **新增 DELETE info 接口**：前端此前用 `updateInfo(status=2)` 降级，现补齐真实删除（软删仍用 status=2，
  物理删除直接 delete；前端确认弹窗已存在）。
- **事件表增加 survey_id**：前端上报含 `surveyId` 且看板依赖，按扩展列处理。
- **积分并发幂等**：代码层先查后发；DDL 提供唯一索引兜底（生产执行前需清理历史重复）。
- **fillUrl 域名**：新增可选环境变量 `ASSESSMENT_H5_ORIGIN`，未配置时返回相对路径，海报二维码在本地开发仍可用。
- **权限码**：`superior_admin` 直通；权限种子通过 README/SQL 注释给出，由运维在 RBAC seed 中执行。
- **quickRegister 验证码**：沿用现有短信验证码体系（type=login / register 双查），不新增验证码通道。
