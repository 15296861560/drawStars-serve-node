import { Module } from '@nestjs/common'
import { RbacModule } from '../rbac/rbac.module'
import { WorkflowController } from './workflow.controller'
import { WorkflowExecutionController } from './workflow-execution.controller'
import {
  WorkflowToolController,
  WorkflowTemplateController
} from './workflow-market.controller'
import {
  WorkflowStatisticsController,
  WorkflowAlertController,
  WorkflowCategoryController
} from './workflow-manage.controller'
import { WorkflowService } from './workflow.service'
import { WorkflowMarketService } from './workflow-market.service'
import { WorkflowStatisticsService } from './workflow-statistics.service'

@Module({
  // PermissionsGuard 依赖 RbacService
  imports: [RbacModule],
  controllers: [
    WorkflowController,
    WorkflowExecutionController,
    WorkflowToolController,
    WorkflowTemplateController,
    WorkflowStatisticsController,
    WorkflowAlertController,
    WorkflowCategoryController
  ],
  providers: [WorkflowService, WorkflowMarketService, WorkflowStatisticsService]
})
export class WorkflowModule {}
