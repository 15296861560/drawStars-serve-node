import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { FillService } from "./fill.service";
import { ScoringService } from "./scoring.service";
import { AuthInfo, getClientIp } from "./survey.util";

@Controller("survey")
export class FillController {
  constructor(
    private readonly fillService: FillService,
    private readonly scoringService: ScoringService,
  ) {}

  @Public()
  @Get("fill/:shareCode")
  async getFill(
    @Param("shareCode") shareCode: string,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.fillService.getFillByShareCode(shareCode, {
      password: query.password,
      source: query.source,
    });
    return { status: true, msg: "ok", data };
  }

  @Public()
  @Post("fill/:shareCode/verify")
  async verify(
    @Param("shareCode") shareCode: string,
    @Body() body: { password?: string },
  ) {
    const data = await this.fillService.verifyPassword(
      shareCode,
      String(body.password || ""),
    );
    return { status: true, msg: "ok", data };
  }

  @Public()
  @Get("fill/:shareCode/result")
  async fillResult(
    @Param("shareCode") shareCode: string,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.scoringService.getFillResult(shareCode, {
      responseId: query.responseId,
      userId: query.userId,
    });
    return { status: true, msg: "ok", data };
  }

  @Public()
  @Get("fill/:shareCode/draft")
  async fillDraft(
    @Param("shareCode") shareCode: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.fillService.getDraftByShareCode(shareCode, auth, {
      userId: query.userId,
      responseId: query.responseId,
    });
    return { status: true, msg: "ok", data };
  }

  @Public()
  @Get("response/:responseId/result")
  async responseResult(@Param("responseId") responseId: string) {
    const data = await this.scoringService.getResultByResponseIdPublic(
      Number(responseId),
    );
    return { status: true, msg: "ok", data };
  }

  @Public()
  @Post(":id/response")
  async submit(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } },
  ) {
    const data = await this.fillService.submitResponse(
      Number(id),
      auth,
      body,
      { ip: getClientIp(req) },
    );
    return { status: true, msg: "提交成功", data };
  }

  @Public()
  @Post(":id/response/draft")
  async draft(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } },
  ) {
    const data = await this.fillService.saveDraft(Number(id), auth, body, {
      ip: getClientIp(req),
    });
    return { status: true, msg: "暂存成功", data };
  }

  @Get(":id/response/draft")
  async getDraft(
    @Param("id") id: string,
    @CurrentUser() auth: AuthInfo | undefined,
    @Query() query: Record<string, string>,
  ) {
    const data = await this.fillService.getDraft(Number(id), auth, {
      userId: query.userId,
      responseId: query.responseId,
    });
    return { status: true, msg: "ok", data };
  }
}
