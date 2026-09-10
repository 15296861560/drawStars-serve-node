import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import type { Request } from 'express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { WorkflowService } from './workflow.service'

/**
 * 流程执行（PRD 7.2：8 个接口）
 * 注意：本 Controller 不使用统一前缀，按 PRD 绝对路径注册，
 * 其中 workflows/:id/execute 与 workflows/:id/test 与流程管理 Controller 同前缀但不冲突。
 */
@Controller()
export class WorkflowExecutionController {
  constructor(private readonly workflowService: WorkflowService) {}

  /** 手动触发执行（仅 PUBLISHED） */
  @Post('workflows/:id/execute')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:execute')
  async execute(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.workflowService.executeWorkflow(id, body, auth)
    return { status: true, msg: '触发成功', data }
  }

  /** 测试运行（DRAFT/REJECTED/PENDING 草稿态） */
  @Post('workflows/:id/test')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:design')
  async test(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.workflowService.testWorkflow(id, body, auth)
    return { status: true, msg: '测试运行完成', data }
  }

  /** 执行历史列表（管理端） */
  @Get('workflow-executions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async list(@Query() query: Record<string, string>) {
    const data = await this.workflowService.listExecutions({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      workflowId: query.workflowId || undefined,
      status: query.status || undefined,
      triggerType: query.triggerType || undefined,
      startTime: query.startTime || undefined,
      endTime: query.endTime || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  /**
   * 我创建的流程的执行记录（用户端「我的执行状态」页，登录即可见，无权限码）。
   * 注意：必须声明在 :id 路由之前，否则 "mine" 会被当作 :id 匹配。
   */
  @Get('workflow-executions/mine')
  async mine(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>
  ) {
    const data = await this.workflowService.myExecutions(auth, {
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      status: query.status || undefined,
      triggerType: query.triggerType || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  /** 执行详情（含节点日志） */
  @Get('workflow-executions/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async detail(@Param('id') id: string) {
    const data = await this.workflowService.getExecution(id)
    return { status: true, msg: 'ok', data }
  }

  /** 取消执行（PENDING/RUNNING/PAUSED → CANCELLED） */
  @Post('workflow-executions/:id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:execute')
  async cancel(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.cancelExecution(id, auth)
    return { status: true, msg: '已取消', data }
  }

  /** 节点执行日志 */
  @Get('workflow-executions/:id/logs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async logs(@Param('id') id: string) {
    const data = await this.workflowService.getExecutionLogs(id)
    return { status: true, msg: 'ok', data }
  }

  /** 基于历史执行输入重新执行 */
  @Post('workflow-executions/:id/rerun')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:execute')
  async rerun(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.rerunExecution(id, auth)
    return { status: true, msg: '重新执行完成', data }
  }

  /**
   * Webhook 触发入口（公开接口，跳过登录认证）
   * TODO: HMAC / Bearer Token 签名校验（TRIGGER 节点 config.authType/authSecret）
   */
  @Public()
  @Post('webhook/:path')
  @Get('webhook/:path')
  async webhook(@Param('path') path: string, @Req() req: Request) {
    const data = await this.workflowService.triggerByWebhook(path, req.method, {
      headers: req.headers,
      query: req.query,
      body: req.body
    })
    return { status: true, msg: 'ok', data }
  }
}
