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
import { TemplateService } from "./template.service";
import { AuthInfo } from "./survey.util";

@Controller("survey")
@UseGuards(PermissionsGuard)
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get("template")
  @RequirePermissions("survey:questionnaire:template")
  async listTemplates(
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const rows = await this.templateService.list(auth, {
      category: query.category,
      keyword: query.keyword,
      mine: query.mine,
    });
    return {
      status: true,
      msg: "ok",
      data: { list: rows, total: rows.length },
    };
  }

  @Get("template/list")
  @RequirePermissions("survey:questionnaire:template")
  async listTemplatesAlias(
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    return this.listTemplates(auth, query);
  }

  @Post("template")
  @RequirePermissions("survey:questionnaire:template")
  async createTemplate(
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.templateService.create(auth, body);
    return { status: true, msg: "创建成功", data };
  }

  @Post("template/create")
  @RequirePermissions("survey:questionnaire:template")
  async createTemplateAlias(
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.createTemplate(auth, body);
  }

  @Put("template/:id")
  @RequirePermissions("survey:questionnaire:template")
  async updateTemplate(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.templateService.update(Number(id), auth, body);
    return { status: true, msg: "更新成功", data };
  }

  @Delete("template/:id")
  @RequirePermissions("survey:questionnaire:template")
  async deleteTemplate(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.templateService.remove(Number(id), auth);
    return { status: true, msg: "删除成功", data };
  }

  @Post("template/:id/use")
  @RequirePermissions("survey:questionnaire:create")
  async useTemplate(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.templateService.useTemplate(Number(id), auth);
    return { status: true, msg: "已从模板创建问卷", data };
  }

  @Get("question-bank")
  @RequirePermissions("survey:questionnaire:questionBank")
  async listBank(
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const rows = await this.templateService.listBank(auth, {
      type: query.type,
      keyword: query.keyword,
      tag: query.tag,
    });
    return {
      status: true,
      msg: "ok",
      data: { list: rows, total: rows.length },
    };
  }

  @Get("question-bank/list")
  @RequirePermissions("survey:questionnaire:questionBank")
  async listBankAlias(
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    return this.listBank(auth, query);
  }

  @Post("question-bank")
  @RequirePermissions("survey:questionnaire:questionBank")
  async createBank(
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.templateService.createBankItem(auth, body);
    return { status: true, msg: "创建成功", data };
  }

  @Post("question-bank/create")
  @RequirePermissions("survey:questionnaire:questionBank")
  async createBankAlias(
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.createBank(auth, body);
  }

  @Put("question-bank/:id")
  @RequirePermissions("survey:questionnaire:questionBank")
  async updateBank(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const data = await this.templateService.updateBankItem(
      Number(id),
      auth,
      body,
    );
    return { status: true, msg: "更新成功", data };
  }

  @Delete("question-bank/:id")
  @RequirePermissions("survey:questionnaire:questionBank")
  async deleteBank(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
  ) {
    const data = await this.templateService.deleteBankItem(Number(id), auth);
    return { status: true, msg: "删除成功", data };
  }
}
