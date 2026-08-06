import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { TaskService } from "./task.service";

@Controller("tasks")
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get("categories")
  async categories() {
    const data = await this.taskService.getCategories();
    return { status: true, msg: "ok", data };
  }

  @Get("my/stats")
  async myStats(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.getMyStats(userId);
    return { status: true, msg: "ok", data };
  }

  @Get("my")
  async myTasks(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.getMyTasks(userId, query.tab);
    return { status: true, msg: "ok", data };
  }

  @Get("achievements")
  async achievements(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.getAchievements(userId);
    return { status: true, msg: "ok", data };
  }

  @Get("notifications")
  async notifications(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.getNotifications(userId);
    return { status: true, msg: "ok", data };
  }

  @Post("notifications/:id/read")
  async readNotification(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(auth, query.userId);
    const data = await this.taskService.readNotification(userId, Number(id));
    return { status: true, msg: "ok", data };
  }

  @Get()
  async hallList(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.tryResolveUserId(auth, query.userId);
    const data = await this.taskService.listHallTasks(userId, query);
    return { status: true, msg: "ok", data };
  }

  @Get(":id")
  async detail(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.tryResolveUserId(auth, query.userId);
    const data = await this.taskService.getTaskDetail(Number(id), userId);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/accept")
  async accept(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Body() body: { userId?: number | string },
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(
      auth,
      query.userId,
      body?.userId,
    );
    const data = await this.taskService.acceptTask(Number(id), userId);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/submit")
  async submit(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(
      auth,
      query.userId,
      body?.userId as string | number | undefined,
    );
    const data = await this.taskService.submitTask(Number(id), userId, body);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/claim")
  async claim(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Body() body: { userId?: number | string },
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(
      auth,
      query.userId,
      body?.userId,
    );
    const data = await this.taskService.claimReward(Number(id), userId);
    return { status: true, msg: "ok", data };
  }

  @Post(":id/claim/shipping")
  async shipping(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Body()
    body: {
      userId?: number | string;
      name: string;
      phone: string;
      address: string;
    },
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(
      auth,
      query.userId,
      body?.userId,
    );
    const data = await this.taskService.saveShippingAddress(Number(id), userId, {
      name: body.name,
      phone: body.phone,
      address: body.address,
    });
    return { status: true, msg: "ok", data };
  }

  @Post(":id/claim/confirm")
  async confirmReceipt(
    @CurrentUser() auth: { uid?: string } | undefined,
    @Param("id") id: string,
    @Body() body: { userId?: number | string },
    @Query() query: Record<string, string>,
  ) {
    const userId = this.taskService.resolveUserId(
      auth,
      query.userId,
      body?.userId,
    );
    const data = await this.taskService.confirmReceipt(Number(id), userId);
    return { status: true, msg: "ok", data };
  }
}
