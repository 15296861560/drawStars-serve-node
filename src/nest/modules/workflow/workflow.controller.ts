import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { WorkflowService } from './workflow.service'

/** 流程管理（PRD 7.1：14 个接口） */
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async list(@Query() query: Record<string, string>) {
    const data = await this.workflowService.listWorkflows({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      keyword: query.keyword || undefined,
      categoryId: query.categoryId || undefined,
      status: query.status || undefined,
      deleted: query.deleted || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:create')
  async create(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.workflowService.createWorkflow(body, auth)
    return { status: true, msg: '创建成功', data }
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async detail(@Param('id') id: string) {
    const data = await this.workflowService.getWorkflow(id)
    return { status: true, msg: 'ok', data }
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:design')
  async update(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.workflowService.updateWorkflow(id, body, auth)
    return { status: true, msg: '保存成功', data }
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.deleteWorkflow(id, auth)
    return { status: true, msg: '删除成功', data }
  }

  @Post(':id/copy')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:create')
  async copy(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.copyWorkflow(id, auth)
    return { status: true, msg: '克隆成功', data }
  }

  /** 提交发布审核：DRAFT/REJECTED → PENDING */
  @Post(':id/publish')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:publish')
  async publish(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.submitAudit(id, auth)
    return { status: true, msg: '已提交审核', data }
  }

  /** 审核：PENDING → PUBLISHED / REJECTED */
  @Post(':id/audit')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:audit')
  async audit(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.workflowService.auditWorkflow(id, body, auth)
    return { status: true, msg: '审核完成', data }
  }

  @Post(':id/pause')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:publish')
  async pause(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.pauseWorkflow(id, auth)
    return { status: true, msg: '已暂停', data }
  }

  @Post(':id/resume')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:publish')
  async resume(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.resumeWorkflow(id, auth)
    return { status: true, msg: '已恢复', data }
  }

  @Post(':id/offline')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:publish')
  async offline(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.offlineWorkflow(id, auth)
    return { status: true, msg: '已下线', data }
  }

  /** 从回收站恢复（软删除还原 → DRAFT） */
  @Post(':id/restore')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:delete')
  async restore(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.restoreWorkflow(id, auth)
    return { status: true, msg: '已恢复', data }
  }

  @Get(':id/versions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async versions(@Param('id') id: string) {
    const data = await this.workflowService.listVersions(id)
    return { status: true, msg: 'ok', data }
  }

  /** 回滚到指定版本（生成新版本快照，不覆盖历史） */
  @Post(':id/versions/:v/rollback')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:design')
  async rollback(
    @Param('id') id: string,
    @Param('v') version: string,
    @CurrentUser() auth: { uid?: string } | undefined
  ) {
    const data = await this.workflowService.rollbackVersion(
      id,
      version,
      auth
    )
    return { status: true, msg: '回滚成功', data }
  }
}
