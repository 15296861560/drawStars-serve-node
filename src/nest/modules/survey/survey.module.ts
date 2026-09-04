import { Module } from '@nestjs/common'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RbacModule } from '../rbac/rbac.module'
import { FillController } from './fill.controller'
import { FillService } from './fill.service'
import { ScoringController } from './scoring.controller'
import { ScoringService } from './scoring.service'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'
import { SurveyController } from './survey.controller'
import { SurveyService } from './survey.service'
import { TemplateController } from './template.controller'
import { TemplateService } from './template.service'

@Module({
  imports: [RbacModule],
  controllers: [
    TemplateController,
    FillController,
    SurveyController,
    StatisticsController,
    ScoringController
  ],
  providers: [
    SurveyService,
    FillService,
    StatisticsService,
    ScoringService,
    TemplateService,
    PermissionsGuard
  ],
  exports: [
    SurveyService,
    FillService,
    StatisticsService,
    ScoringService,
    TemplateService
  ]
})
export class SurveyModule {}
