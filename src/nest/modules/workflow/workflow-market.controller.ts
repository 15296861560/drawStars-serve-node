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
import { WorkflowMarketService } from './workflow-market.service'

/** 工具管理（PRD 7.3：6 个接口） */
@Controller('workflow-tools')
export class WorkflowToolController {
  constructor(private readonly marketService: WorkflowMarketService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async list(@Query() query: Record<string, string>) {
    const data = await this.marketService.listTools({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      keyword: query.keyword || undefined,
      category: query.category || undefined,
      enabled: query.enabled || undefined,
      isBuiltin: query.isBuiltin || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async create(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.createTool(body, auth)
    return { status: true, msg: '创建成功', data }
  }

  /** 注意：字面量路由需在 :id 参数路由之前声明 */
  @Post('import')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async importOpenApi(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.importToolFromOpenApi(body, auth)
    return { status: true, msg: '导入成功', data }
  }

  @Post(':id/test')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async test(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.testTool(id, body)
    return { status: true, msg: '测试完成', data }
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.updateTool(id, body)
    return { status: true, msg: '更新成功', data }
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async remove(@Param('id') id: string) {
    const data = await this.marketService.deleteTool(id)
    return { status: true, msg: '删除成功', data }
  }
}

/** 模板市场（PRD 7.3：4 个接口） */
@Controller('workflow-templates')
export class WorkflowTemplateController {
  constructor(private readonly marketService: WorkflowMarketService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async list(@Query() query: Record<string, string>) {
    const data = await this.marketService.listTemplates({
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      keyword: query.keyword || undefined,
      category: query.category || undefined,
      isOfficial: query.isOfficial || undefined
    })
    return { status: true, msg: 'ok', data }
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:operate')
  async create(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.createTemplate(body, auth)
    return { status: true, msg: '发布成功', data }
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:list')
  async detail(@Param('id') id: string) {
    const data = await this.marketService.getTemplate(id)
    return { status: true, msg: 'ok', data }
  }

  /** 一键安装：以模板画布创建 DRAFT 流程，installCount + 1 */
  @Post(':id/install')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('system:workflow:create')
  async install(
    @Param('id') id: string,
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.marketService.installTemplate(id, body, auth)
    return { status: true, msg: '安装成功', data }
  }
}
