import { Module } from '@nestjs/common'
import { RbacModule } from '../rbac/rbac.module'
import { PointsModule } from '../points/points.module'
import { TaskService } from './task.service'
import { TaskController } from './task.controller'
import {
  AdminTaskController,
  AdminTaskStatisticsController,
  AdminRewardsController,
  AdminTaskCategoryController,
  AdminTaskTemplateController
} from './admin-task.controller'

@Module({
  imports: [RbacModule, PointsModule],
  controllers: [
    TaskController,
    AdminTaskController,
    AdminTaskStatisticsController,
    AdminRewardsController,
    AdminTaskCategoryController,
    AdminTaskTemplateController
  ],
  providers: [TaskService],
  exports: [TaskService]
})
export class TaskModule {}
