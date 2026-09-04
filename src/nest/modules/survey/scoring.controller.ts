import {
  Body,
  Controller,
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
import { ScoringService } from './scoring.service'
import { AuthInfo } from './survey.util'

@Controller('survey')
@UseGuards(PermissionsGuard)
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Get(':id/scoring/config')
  @RequirePermissions('survey:questionnaire:list')
  async getConfig(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.getConfig(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Put(':id/scoring/config')
  @RequirePermissions('survey:questionnaire:update')
  async putConfig(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.scoringService.putConfig(Number(id), auth, body)
    return { status: true, msg: '保存成功', data }
  }

  @Get(':id/scoring/rules')
  @RequirePermissions('survey:questionnaire:list')
  async getRules(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.getRules(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Put(':id/scoring/rules')
  @RequirePermissions('survey:questionnaire:update')
  async putRules(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const data = await this.scoringService.putRules(Number(id), auth, body)
    return { status: true, msg: '保存成功', data }
  }

  @Get(':id/scoring/result')
  @RequirePermissions('survey:questionnaire:analyze')
  async listResults(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>
  ) {
    const data = await this.scoringService.listResults(Number(id), auth, query)
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/scoring/result/:responseId')
  @RequirePermissions('survey:questionnaire:analyze')
  async resultDetail(
    @Param('id') id: string,
    @Param('responseId') responseId: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.getResultByResponseId(
      Number(id),
      Number(responseId),
      auth
    )
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/scoring/distribution')
  @RequirePermissions('survey:questionnaire:analyze')
  async distribution(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.distribution(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/scoring/ranking')
  @RequirePermissions('survey:questionnaire:analyze')
  async ranking(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>
  ) {
    const data = await this.scoringService.ranking(Number(id), auth, query)
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/scoring/item-analysis')
  @RequirePermissions('survey:questionnaire:analyze')
  async itemAnalysis(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.itemAnalysis(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Get(':id/grading/list')
  @RequirePermissions('survey:questionnaire:grading')
  async gradingList(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined
  ) {
    const data = await this.scoringService.gradingList(Number(id), auth)
    return { status: true, msg: 'ok', data }
  }

  @Post(':id/grading/batch')
  @RequirePermissions('survey:questionnaire:grading')
  async batchGrade(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      questionId: number
      grades: Array<{ responseId: number; score: number }>
    }
  ) {
    const data = await this.scoringService.batchGrade(Number(id), auth, body)
    return { status: true, msg: '批量评分成功', data }
  }

  @Post(':id/grading/review')
  @RequirePermissions('survey:questionnaire:grading')
  async reviewGrade(
    @Param('id') id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      responseId: number
      scores?: Array<{ questionId: number; score: number }>
      remark?: string
    }
  ) {
    const data = await this.scoringService.reviewGrade(Number(id), auth, body)
    return { status: true, msg: '复核成功', data }
  }

  @Post(':id/grading/:responseId')
  @RequirePermissions('survey:questionnaire:grading')
  async submitGrade(
    @Param('id') id: string,
    @Param('responseId') responseId: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      scores?: Array<{ questionId: number; score: number }>
      items?: Array<{ questionId: number; score: number }>
    }
  ) {
    const data = await this.scoringService.submitGrade(
      Number(id),
      Number(responseId),
      auth,
      body
    )
    return { status: true, msg: '评分成功', data }
  }
}
