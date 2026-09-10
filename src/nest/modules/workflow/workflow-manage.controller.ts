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
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { WorkflowStatisticsService } from './workflow-statistics.service'

/**
 * 统计概览（PRD 7.4：4 个接口）
 * 注意：本 Controller 不使用统一前缀，按 PRD 绝对路径注册；
 * workflows/statistics/* 为多段路径，与流程管理 Controller 的
 * GET workflows/:id（单段）、GET workflows/:id/versions（字面量尾段）均不冲突。
 */
@Controller()
export class WorkflowStatisticsController {
  constructor(
    private readonly statisticsService: WorkflowStatisticsService
  ) {}

  @Get('workflows/statistics/overview')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async overview() {
    const data = await this.statisticsService.overview()
    return { status: true, msg: 'ok', data }
  }

  @Get('workflows/statistics/trend')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async trend(@Query() query: Record<string, string>) {
    const data = await this.statisticsService.trend({
      days: query.days ? Number(query.days) : undefined
    })
    return { status: true, msg: 'ok', data }
  }

  /** 数据导出（CSV 字符串，前端可另存为 .csv 文件） */
  @Post('workflows/statistics/export')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async export(@Body() body: Record<string, unknown>) {
    const data = await this.statisticsService.exportExecutions(body)
    return { status: true, msg: '导出成功', data }
  }

  /** 单流程分析（:id 需放在字面量路由之后声明） */
  @Get('workflows/statistics/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async workflowStatistics(
    @Param('id') id: string,
    @Query() query: Record<string, string>
  ) {
    const data = await this.statisticsService.workflowStatistics(id, {
      days: query.days ? Number(query.days) : undefined
    })
    return { status: true, msg: 'ok', data }
  }
}

/** 告警规则管理（PRD 7.4：GET/POST/PUT/DELETE） */
@Controller('workflow-alerts')
export class WorkflowAlertController {
  constructor(
    private readonly statisticsService: WorkflowStatisticsService
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async list(@Query() query: Record<string, string>) {
    const data = await this.statisticsService.listAlerts({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      workflowId: query.workflowId || undefined,
      enabled: query.enabled || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async create(@Body() body: Record<string, unknown>) {
    const data = await this.statisticsService.createAlert(body)
    return { status: true, msg: '创建成功', data }
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.statisticsService.updateAlert(id, body)
    return { status: true, msg: '更新成功', data }
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async remove(@Param('id') id: string) {
    const data = await this.statisticsService.deleteAlert(id)
    return { status: true, msg: '删除成功', data }
  }
}

/** 流程分类管理（PRD 7.5：GET/POST/PUT/DELETE） */
@Controller('workflow-categories')
export class WorkflowCategoryController {
  constructor(
    private readonly statisticsService: WorkflowStatisticsService
  ) {}

  /** 全量小表，不分页 */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async list(@Query() query: Record<string, string>) {
    const data = await this.statisticsService.listCategories({
      enabled: query.enabled || undefined,
      keyword: query.keyword || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async create(@Body() body: Record<string, unknown>) {
    const data = await this.statisticsService.createCategory(body)
    return { status: true, msg: '创建成功', data }
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.statisticsService.updateCategory(id, body)
    return { status: true, msg: '更新成功', data }
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async remove(@Param('id') id: string) {
    const data = await this.statisticsService.deleteCategory(id)
    return { status: true, msg: '删除成功', data }
  }
}
