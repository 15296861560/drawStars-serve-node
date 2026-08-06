import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TaskService } from "./task.service";

@Controller("admin/tasks")
export class AdminTaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get("list")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async list(@Query() query: Record<string, string>) {
    const data = await this.taskService.adminListTasks(query);
    return { status: true, msg: "ok", data };
  }

  @Get("statistics/overview")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async statisticsOverview() {
    const data = await this.taskService.getStatisticsOverview();
    return { status: true, msg: "ok", data };
  }

  @Post("assign")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(
    "system:task:assign",
    "system:task:claim",
    "system:task:operate",
  )
  async assign(
    @Body() body: { taskId: number; userIds: number[] },
  ) {
    const data = await this.taskService.assignTask(body);
    return { status: true, msg: "ok", data };
  }

  @Post("assign/batch")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(
    "system:task:assign",
    "system:task:claim",
    "system:task:operate",
  )
  async batchAssign(
    @Body()
    body: {
      taskId: number;
      userIds?: number[];
      roleIds?: number[];
    },
  ) {
    const data = await this.taskService.batchAssign(body);
    return { status: true, msg: "ok", data };
  }

  @Post("assign/revoke")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:assign", "system:task:operate")
  async revokeAssign(
    @Body() body: { taskId: number; userIds: number[] },
  ) {
    const data = await this.taskService.revokeAssign(body);
    return { status: true, msg: "ok", data };
  }

  @Get(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async detail(@Param("id") id: string) {
    const data = await this.taskService.adminGetTask(Number(id));
    return { status: true, msg: "ok", data };
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:create", "system:task:operate")
  async create(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ) {
    const operatorId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.createTask(body, operatorId);
    return { status: true, msg: "ok", data };
  }

  @Put(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:update", "system:task:operate")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.taskService.updateTask(Number(id), body);
    return { status: true, msg: "ok", data };
  }

  @Delete(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:delete", "system:task:operate")
  async remove(@Param("id") id: string) {
    const data = await this.taskService.deleteTask(Number(id));
    return { status: true, msg: "ok", data };
  }

  @Post(":id/audit")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:audit")
  async audit(
    @Param("id") id: string,
    @Body() body: { action: "APPROVE" | "REJECT"; reason?: string },
  ) {
    const data = await this.taskService.auditTask(Number(id), body);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/copy")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:create", "system:task:operate")
  async copy(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Query() query: Record<string, string>,
  ) {
    const operatorId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.copyTask(Number(id), operatorId);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/pause")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:status", "system:task:operate")
  async pause(@Param("id") id: string) {
    const data = await this.taskService.setTaskStatus(Number(id), "PAUSED");
    return { status: true, msg: "ok", data };
  }

  @Post(":id/resume")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:status", "system:task:operate")
  async resume(@Param("id") id: string) {
    const data = await this.taskService.setTaskStatus(Number(id), "APPROVED");
    return { status: true, msg: "ok", data };
  }

  @Post(":id/offline")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:status", "system:task:operate")
  async offline(@Param("id") id: string) {
    const data = await this.taskService.setTaskStatus(Number(id), "OFFLINE");
    return { status: true, msg: "ok", data };
  }
}

/** Matches frontend: GET /admin/statistics/overview */
@Controller("admin/statistics")
export class AdminTaskStatisticsController {
  constructor(private readonly taskService: TaskService) {}

  @Get("overview")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async overview() {
    const data = await this.taskService.getStatisticsOverview();
    return { status: true, msg: "ok", data };
  }

  @Get("trend")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async trend(@Query() query: Record<string, string>) {
    const data = await this.taskService.getStatisticsTrend({
      days: query.days ? Number(query.days) : undefined,
    });
    return { status: true, msg: "ok", data };
  }

  @Get("task/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async taskStats(@Param("id") id: string) {
    const data = await this.taskService.getTaskStatistics(Number(id));
    return { status: true, msg: "ok", data };
  }

  @Get("user")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async userStats(@Query() query: Record<string, string>) {
    const data = await this.taskService.getUserStatistics({
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return { status: true, msg: "ok", data };
  }

  @Get("reward")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async rewardStats() {
    const data = await this.taskService.getRewardStatistics();
    return { status: true, msg: "ok", data };
  }

  @Post("export")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async export(
    @Body() body: { type?: "overview" | "claims" | "tasks" },
  ) {
    const data = await this.taskService.exportStatistics(body || {});
    return { status: true, msg: "ok", data };
  }
}

/** Matches frontend: /admin/rewards/claims and /admin/rewards/ship */
@Controller("admin/rewards")
export class AdminRewardsController {
  constructor(private readonly taskService: TaskService) {}

  @Get("claims")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:list")
  async claims() {
    const data = await this.taskService.listRewardClaims();
    return { status: true, msg: "ok", data };
  }

  @Get("templates")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async listTemplates() {
    const data = await this.taskService.listRewardTemplates();
    return { status: true, msg: "ok", data };
  }

  @Post("templates")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async createTemplate(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ) {
    const operatorId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.createRewardTemplate(body, operatorId);
    return { status: true, msg: "ok", data };
  }

  @Put("templates/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async updateTemplate(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.taskService.updateRewardTemplate(Number(id), body);
    return { status: true, msg: "ok", data };
  }

  @Delete("templates/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async deleteTemplate(@Param("id") id: string) {
    const data = await this.taskService.deleteRewardTemplate(Number(id));
    return { status: true, msg: "ok", data };
  }

  @Post("ship")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async ship(
    @Body()
    body: {
      claimId: number;
      logisticsCompany: string;
      trackingNo: string;
    },
  ) {
    const data = await this.taskService.shipReward(body);
    return { status: true, msg: "ok", data };
  }
}

@Controller("admin/categories")
export class AdminTaskCategoryController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async list() {
    const data = await this.taskService.adminListCategories();
    return { status: true, msg: "ok", data };
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async create(@Body() body: Record<string, unknown>) {
    const data = await this.taskService.createCategory(body);
    return { status: true, msg: "ok", data };
  }

  @Put(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.taskService.updateCategory(Number(id), body);
    return { status: true, msg: "ok", data };
  }

  @Delete(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async remove(@Param("id") id: string) {
    const data = await this.taskService.deleteCategory(Number(id));
    return { status: true, msg: "ok", data };
  }
}

/** Task definition templates (admin) */
@Controller("admin/task-templates")
export class AdminTaskTemplateController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async list() {
    const data = await this.taskService.listTaskTemplates();
    return { status: true, msg: "ok", data };
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async create(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ) {
    const operatorId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.createTaskTemplate(body, operatorId);
    return { status: true, msg: "ok", data };
  }

  @Put(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.taskService.updateTaskTemplate(Number(id), body);
    return { status: true, msg: "ok", data };
  }

  @Delete(":id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:task:operate")
  async remove(@Param("id") id: string) {
    const data = await this.taskService.deleteTaskTemplate(Number(id));
    return { status: true, msg: "ok", data };
  }
}
