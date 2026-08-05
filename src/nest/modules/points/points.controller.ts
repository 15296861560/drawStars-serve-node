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
import { PointsService } from "./points.service";

@Controller("points")
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get("account")
  async account(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.pointsService.resolveUserId(auth, query.userId);
    const data = await this.pointsService.getAccount(
      userId,
      query.pointsType || "GENERAL",
    );
    return { status: true, msg: "ok", data };
  }

  @Get("transactions")
  async transactions(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.pointsService.resolveUserId(auth, query.userId);
    const data = await this.pointsService.getTransactions({
      userId,
      accountId: query.accountId ? Number(query.accountId) : undefined,
      type: query.type || undefined,
      source: query.source || undefined,
      startTime: query.startTime || undefined,
      endTime: query.endTime || undefined,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
    });
    return { status: true, msg: "ok", data };
  }

  @Get("rules")
  async rules(@Query() query: Record<string, string>) {
    const data = await this.pointsService.getRules({
      source: query.source || undefined,
      pointsType: query.pointsType || undefined,
      enabled: query.enabled,
    });
    return { status: true, msg: "ok", data };
  }

  @Post("rules")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async createRule(@Body() body: Record<string, unknown>) {
    const data = await this.pointsService.createRule(body as never);
    return { status: true, msg: "创建成功", data };
  }

  @Put("rules")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async updateRule(@Body() body: Record<string, unknown>) {
    const data = await this.pointsService.updateRule(body as never);
    return { status: true, msg: "更新成功", data };
  }

  @Delete("rules/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async deleteRule(@Param("id") id: string) {
    await this.pointsService.deleteRule(Number(id));
    return { status: true, msg: "删除成功", data: true };
  }

  @Get("levels")
  async levels() {
    const data = await this.pointsService.getLevels();
    return { status: true, msg: "ok", data };
  }

  @Post("levels")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async createLevel(@Body() body: Record<string, unknown>) {
    const data = await this.pointsService.createLevel(body as never);
    return { status: true, msg: "创建成功", data };
  }

  @Put("levels")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async updateLevel(@Body() body: Record<string, unknown>) {
    const data = await this.pointsService.updateLevel(body as never);
    return { status: true, msg: "更新成功", data };
  }

  @Delete("levels/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async deleteLevel(@Param("id") id: string) {
    await this.pointsService.deleteLevel(Number(id));
    return { status: true, msg: "删除成功", data: true };
  }

  @Get("statistics")
  async statistics(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.pointsService.resolveUserId(auth, query.userId);
    const data = await this.pointsService.getStatistics(userId);
    return { status: true, msg: "ok", data };
  }

  @Post("check-in")
  async checkIn(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body() body: { userId?: number | string },
  ) {
    const userId = this.pointsService.resolveUserId(
      auth,
      undefined,
      body?.userId,
    );
    const data = await this.pointsService.checkIn(userId);
    return { status: true, msg: "ok", data };
  }

  @Get("check-in/status")
  async checkInStatus(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.pointsService.resolveUserId(auth, query.userId);
    const data = await this.pointsService.getCheckInStatus(userId);
    return { status: true, msg: "ok", data };
  }

  @Post("operate")
  async operate(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body()
    body: {
      userId?: number | string;
      points: number;
      source: string;
      referenceId?: string;
      referenceType?: string;
      description: string;
      immediate?: boolean;
      extra?: Record<string, unknown>;
    },
  ) {
    const userId = this.pointsService.resolveUserId(
      auth,
      undefined,
      body?.userId,
    );
    const data = await this.pointsService.operatePoints({
      userId,
      points: Number(body.points),
      source: body.source,
      referenceId: body.referenceId,
      referenceType: body.referenceType,
      description: body.description,
      immediate: body.immediate,
      extra: body.extra,
    });
    return { status: true, msg: "ok", data };
  }

  /**
   * 管理员给指定用户新增积分
   * - 必须填写原因（reason）
   * - 操作人取自当前登录用户，写入流水
   */
  @Post("admin/grant")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:operate")
  async adminGrant(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Body()
    body: {
      userId: number | string;
      points: number;
      reason: string;
    },
  ) {
    const operatorId = this.pointsService.resolveUserId(auth);
    const data = await this.pointsService.adminGrantPoints({
      userId: Number(body.userId),
      points: Number(body.points),
      reason: body.reason,
      operatorId,
    });
    return { status: true, msg: "新增积分成功", data };
  }

  /** 管理端积分流水（可按用户/来源筛选，含操作人） */
  @Get("admin/transactions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:points:list")
  async adminTransactions(@Query() query: Record<string, string>) {
    const data = await this.pointsService.getAdminTransactions({
      userId: query.userId ? Number(query.userId) : undefined,
      source: query.source || undefined,
      type: query.type || undefined,
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
    });
    return { status: true, msg: "ok", data };
  }

  @Get("calculate-deduction")
  async calculateDeduction(@Query("points") points: string) {
    const data = await this.pointsService.calculateDeduction(Number(points));
    return { status: true, msg: "ok", data };
  }
}
