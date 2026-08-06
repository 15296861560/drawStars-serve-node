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
import { SurveyService } from "./survey.service";
import { AuthInfo } from "./survey.util";

@Controller("survey")
@UseGuards(PermissionsGuard)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Get("list")
  @RequirePermissions("survey:questionnaire:list")
  async list(
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.surveyService.list(auth, {
      page: query.page
        ? Number(query.page)
        : query.curPage
          ? Number(query.curPage)
          : 1,
      pageSize: query.pageSize ? Number(query.pageSize) : 10,
      status: query.status,
      keyword: query.keyword || query.title,
      type: query.type,
      mine: query.mine,
    });
    return { status: true, msg: "ok", data };
  }

  @Post("create")
  @RequirePermissions("survey:questionnaire:create")
  async create(
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.surveyService.create(auth, body);
    return { status: true, msg: "创建成功", data };
  }

  @Get(":id")
  @RequirePermissions("survey:questionnaire:list")
  async detail(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.detail(Number(id), auth);
    return { status: true, msg: "ok", data };
  }

  @Put(":id")
  @RequirePermissions("survey:questionnaire:update")
  async update(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.surveyService.update(Number(id), auth, body);
    return { status: true, msg: "更新成功", data };
  }

  @Delete(":id")
  @RequirePermissions("survey:questionnaire:delete")
  async remove(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.remove(Number(id), auth);
    return { status: true, msg: "删除成功", data };
  }

  @Post(":id/copy")
  @RequirePermissions("survey:questionnaire:create")
  async copy(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.copy(Number(id), auth);
    return { status: true, msg: "复制成功", data };
  }

  @Post(":id/questions")
  @RequirePermissions("survey:questionnaire:update")
  async saveQuestions(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { questions?: Array<Record<string, unknown>> },
  ) {
    const data = await this.surveyService.saveQuestions(Number(id), auth, body);
    return { status: true, msg: "保存成功", data };
  }

  @Put(":id/questions/sort")
  @RequirePermissions("survey:questionnaire:update")
  async sortQuestions(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body()
    body: {
      orders?: Array<{ id: number; sortOrder: number; pageIndex?: number }>;
    },
  ) {
    const data = await this.surveyService.sortQuestions(Number(id), auth, body);
    return { status: true, msg: "排序成功", data };
  }

  @Get(":id/logic")
  @RequirePermissions("survey:questionnaire:list")
  async getLogic(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.getLogic(Number(id), auth);
    return { status: true, msg: "ok", data };
  }

  @Put(":id/logic")
  @RequirePermissions("survey:questionnaire:update")
  async putLogic(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { rules?: Array<Record<string, unknown>> },
  ) {
    const data = await this.surveyService.putLogic(Number(id), auth, body);
    return { status: true, msg: "保存成功", data };
  }

  @Post(":id/publish")
  @RequirePermissions("survey:questionnaire:publish")
  async publish(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.surveyService.publish(Number(id), auth, body || {});
    return { status: true, msg: "发布成功", data };
  }

  @Post(":id/pause")
  @RequirePermissions("survey:questionnaire:publish")
  async pause(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.pause(Number(id), auth);
    return { status: true, msg: "已暂停", data };
  }

  @Post(":id/close")
  @RequirePermissions("survey:questionnaire:publish")
  async close(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.surveyService.close(Number(id), auth);
    return { status: true, msg: "已结束", data };
  }

  @Get(":id/share")
  @RequirePermissions("survey:questionnaire:list")
  async share(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.surveyService.getShareInfo(Number(id), auth, {
      baseUrl: query.baseUrl,
    });
    return { status: true, msg: "ok", data };
  }

  @Post(":id/notify-share")
  @RequirePermissions("survey:questionnaire:publish")
  async notifyShare(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: { userIds?: Array<number | string>; message?: string },
  ) {
    const data = await this.surveyService.notifyShare(Number(id), auth, body || {});
    return { status: true, msg: "已发送站内邀请", data };
  }
}
