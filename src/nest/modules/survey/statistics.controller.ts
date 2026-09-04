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
import { StatisticsService } from './statistics.service'
import { AuthInfo } from './survey.util'

@Controller('survey')
@UseGuards(PermissionsGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get(':id/statistics/overview')
  @RequirePermissions('survey:questionnaire:analyze')
  async overview(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.overview(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/statistics/question/:qid')
  @RequirePermissions('survey:questionnaire:analyze')
  async questionStats(
    @Param('id') id: string,
    @Param('qid') qid: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.questionStats(
      Number(id),
      Number(qid),
      auth
    )
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/statistics/cross')
  @RequirePermissions('survey:questionnaire:analyze')
  async cross(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      rowQuestionId: number
      colQuestionId: number
      metric?: string
    }
  ) {
    const data = await this.statisticsService.crossAnalysis(
      Number(id),
      auth,
      body
    )
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/statistics/quality')
  @RequirePermissions('survey:questionnaire:analyze')
  async quality(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.qualityAnalysis(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/statistics/quality/mark')
  @RequirePermissions('survey:questionnaire:analyze')
  async markQuality(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      responseIds: Array<number | string>
      isValid: boolean
      reason?: string
    }
  ) {
    const data = await this.statisticsService.markQuality(
      Number(id),
      auth,
      body
    )
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/statistics/filter')
  @RequirePermissions('survey:questionnaire:analyze')
  async filter(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { filter?: Record<string, unknown> }
  ) {
    const data = await this.statisticsService.filterStats(
      Number(id),
      auth,
      body
    )
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/statistics/compare')
  @RequirePermissions('survey:questionnaire:analyze')
  async compare(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      viewA?: Record<string, unknown>
      viewB?: Record<string, unknown>
      filters?: [Record<string, unknown>, Record<string, unknown>]
    }
  ) {
    const data = await this.statisticsService.compareViews(
      Number(id),
      auth,
      body
    )
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/statistics/report')
  @RequirePermissions('survey:questionnaire:analyze')
  async listReports(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.listReports(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/statistics/report')
  @RequirePermissions('survey:questionnaire:analyze')
  async createReport(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { name?: string; config?: Record<string, unknown> }
  ) {
    const data = await this.statisticsService.createReport(
      Number(id),
      auth,
      body
    )
    return { status: true, msg: '创建成功', data }
  }

  @Put(':id/statistics/report/:reportId')
  @RequirePermissions('survey:questionnaire:analyze')
  async updateReport(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { name?: string; config?: Record<string, unknown> }
  ) {
    const data = await this.statisticsService.updateReport(
      Number(id),
      Number(reportId),
      auth,
      body
    )
    return { status: true, msg: '更新成功', data }
  }

  @Delete(':id/statistics/report/:reportId')
  @RequirePermissions('survey:questionnaire:analyze')
  async deleteReport(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.deleteReport(
      Number(id),
      Number(reportId),
      auth
    )
    return { status: true, msg: '删除成功', data }
  }

  @Get(':id/export')
  @RequirePermissions('survey:questionnaire:export')
  async exportSync(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>
  ) {
    const data = await this.statisticsService.exportSync(Number(id), auth, {
      format: query.format,
      onlyValid: query.onlyValid
    })
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/export/async')
  @RequirePermissions('survey:questionnaire:export')
  async exportAsync(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      format?: string
      onlyValid?: boolean
      options?: Record<string, unknown>
    }
  ) {
    const data = await this.statisticsService.createExportTask(
      Number(id),
      auth,
      body || {}
    )
    return { status: true, msg: '任务已创建', data }
  }

  @Get(':id/export/task/:taskId')
  @RequirePermissions('survey:questionnaire:export')
  async exportTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.statisticsService.getExportTask(
      Number(id),
      Number(taskId),
      auth
    )
    return { status: true, msg: 'ok', data }
  }
}
