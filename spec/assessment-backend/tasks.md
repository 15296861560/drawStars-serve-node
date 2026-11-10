# 心智测评后端实施任务清单

> 规格：`spec/assessment-backend/spec.md`
> 约定：中文注释；标识符英文；不修改前端页面业务逻辑。

## T1 数据库与 Prisma 建模

- [x] 新建 `sql/assessment_tables.sql`：5 表 DDL（`assessment_event` 含 `survey_id`）、
      `points_rule` 三条种子、`points_transaction` 幂等唯一键建议。
- [x] `prisma/schema.prisma` 末尾追加 5 个 model：
      `AssessmentOaConfig / AssessmentReplyRule / AssessmentChannel / AssessmentInfo / AssessmentEvent`。
- [x] 验收：`npx prisma generate` 成功；`npx prisma validate` 无错误。

## T2 常量与类型

- [x] 新建 `src/nest/modules/assessment/assessment.constants.ts`：
      类型库 10 型、`M0_GRADE_MAP`、`M1_DIMENSIONS`、`M2_DIMENSIONS`、`M2_PROFILE_TITLES`、
      `ASSESSMENT_POINTS`、`CHANNEL_SOURCES`、事件类型白名单、默认引导文案。
- [x] 验收：与 `drawStars-Vue3/src/config/assessment-registry.ts` 文案一致。

## T3 事件上报与防刷

- [x] 新建 `assessment-event.service.ts`：`report()`（白名单、sessionId、E01 五来源+refId≤32、
      5 分钟去重、60 次/分钟限流、UA 截断、created_day）。
- [x] 验收：重复事件不新增；非法 source 400；超频返回 eventId=0。

## T4 报告聚合

- [x] 新建 `assessment-report.service.ts`：`build(responseId)`，按 spec §5 实现 M0/M1/M2；
      选项维度聚合 + scoringResult 维度回退 + responseNo + fillUrl。
- [x] 验收：三型报告字段齐全；同一 responseId 结果稳定。

## T5 积分幂等

- [x] 新建 `assessment-points.service.ts`：`grant()` / `claim()`，幂等键与 `points_transaction` 校验，
      复用 `PointsService.operatePoints` 与 `ruleCode`。
- [x] 验收：重复调用返回 `granted:false`；已发放的 claim 返回 `claimed:true`。

## T6 业务服务（配置/上架/渠道/回复/看板/注册）

- [x] 新建 `assessment.service.ts`：
      `getOaConfig/updateOaConfig`、`plazaList`、`getGuideConfig`、
      `listInfos/createInfo/updateInfo/deleteInfo/publishInfo`、`listChannels/createChannel/updateChannel/deleteChannel`、
      `listReplyRules/createReplyRule/updateReplyRule/deleteReplyRule`、`statsOverview`、`quickRegister`。
- [x] 验收：管理端 CRUD 正常；编辑已上架记录自动下架；发布走四项校验。

## T7 控制器与模块注册

- [x] `assessment-public.controller.ts`（`@Controller('assessmentApi')`，公开方法加 `@Public()`）。
- [x] `assessment-admin.controller.ts`（`PermissionsGuard` + 权限码）。
- [x] `assessment.module.ts`：imports `PointsModule`、`SurveyModule`、`UsersModule`；导出 `AssessmentService`。
- [x] `app.module.ts` 注册 `AssessmentModule`。
- [x] `auth.controller.ts` 注入 `AssessmentService`，新增 `POST loginApi/quickRegister`；
      `auth.module.ts` imports `AssessmentModule`；处理异常并返回 `{status,msg,data}`。
- [x] 验收：`npx tsc --noEmit` 通过；路由可访问。

## T8 前端接口补齐

- [x] `drawStars-Vue3/src/api/assessment.ts` 新增 `deleteInfo(id)`（mock/真实双分支）。
- [x] `drawStars-Vue3/src/services/assessment-mock.ts` 新增 `mockDeleteInfo(id)`。
- [x] 验收：`npm run build` 通过（前端）。

## T9 联调验证

- [x] 后端启动，按 spec §11 逐条 curl 冒烟。
- [x] 前端 `VITE_ASSESSMENT_MOCK=false` 走查：广场→填写→报告→海报→注册→管理端五页。
- [x] 数据库抽查事件表、积分流水幂等。

## 依赖顺序

T1 → T2 → (T3 ‖ T4 ‖ T5) → T6 → T7 → T8 → T9
