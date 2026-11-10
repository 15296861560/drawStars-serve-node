import { Module } from '@nestjs/common'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { PointsModule } from '../points/points.module'
import { RbacModule } from '../rbac/rbac.module'
import { UsersModule } from '../users/users.module'
import { AssessmentAdminController } from './assessment-admin.controller'
import { AssessmentEventService } from './assessment-event.service'
import { AssessmentPointsService } from './assessment-points.service'
import { AssessmentPublicController } from './assessment-public.controller'
import { AssessmentReportService } from './assessment-report.service'
import { AssessmentService } from './assessment.service'

@Module({
  imports: [PointsModule, UsersModule, RbacModule],
  controllers: [AssessmentPublicController, AssessmentAdminController],
  providers: [
    AssessmentService,
    AssessmentEventService,
    AssessmentReportService,
    AssessmentPointsService,
    PermissionsGuard
  ],
  exports: [AssessmentService]
})
export class AssessmentModule {}
