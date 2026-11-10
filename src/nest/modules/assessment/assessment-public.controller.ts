import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { PointsService } from '../points/points.service'
import { AssessmentEventService } from './assessment-event.service'
import { AssessmentPointsService } from './assessment-points.service'
import { AssessmentReportService } from './assessment-report.service'
import { AssessmentService } from './assessment.service'

type AuthInfo = { uid?: string | number; userId?: string | number }

/** C 端公开接口（无需登录） */
@Controller('assessmentApi')
export class AssessmentPublicController {
  constructor(
    private readonly assessmentService: AssessmentService,
    private readonly eventService: AssessmentEventService,
    private readonly reportService: AssessmentReportService,
    private readonly assessmentPoints: AssessmentPointsService,
    private readonly pointsService: PointsService
  ) {}

  @Public()
  @Get('plaza/list')
  async plazaList(@Query() query: Record<string, string>) {
    const data = await this.assessmentService.plazaList({
      typeKey: query.typeKey,
      page: query.page,
      pageSize: query.pageSize
    })
    return { status: true, msg: 'ok', data }
  }

  @Public()
  @Get('guide/config')
  async guideConfig() {
    const data = await this.assessmentService.getGuideConfig()
    return { status: true, msg: 'ok', data }
  }

  @Public()
  @Post('event/report')
  async reportEvent(
    @Body() body: Record<string, unknown>,
    @CurrentUser() auth?: AuthInfo
  ) {
    const uid = auth?.uid ? Number(auth.uid) : undefined
    const data = await this.eventService.report(body as never, uid)
    return { status: true, msg: 'ok', data }
  }

  @Public()
  @Get('report/:responseId')
  async report(@Param('responseId') responseId: string) {
    const data = await this.reportService.build(responseId)
    return { status: true, msg: 'ok', data }
  }

  @Post('points/claim')
  async claim(
    @Body()
    body: { scenario: string; responseId?: string; userId?: number },
    @CurrentUser() auth?: AuthInfo
  ) {
    const userId = this.pointsService.resolveUserId(auth, undefined, body.userId)
    const data = await this.assessmentPoints.claim(
      body.scenario,
      body.responseId,
      userId
    )
    return { status: true, msg: 'ok', data }
  }

  @Post('points/grant')
  async grant(
    @Body()
    body: {
      scenario: string
      responseId?: string
      eventId?: number
      userId?: number
    },
    @CurrentUser() auth?: AuthInfo
  ) {
    const userId = this.pointsService.resolveUserId(auth, undefined, body.userId)
    const data = await this.assessmentPoints.grant(
      body.scenario,
      { responseId: body.responseId, eventId: body.eventId },
      userId
    )
    return { status: true, msg: 'ok', data }
  }
}
