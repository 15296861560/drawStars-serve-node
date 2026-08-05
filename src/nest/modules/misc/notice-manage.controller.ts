import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { NoticeManageService } from "./notice-manage.service";
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../../../lib/access-token-service";

@Controller("noticeApi")
export class NoticeManageController {
  constructor(private readonly noticeManageService: NoticeManageService) {}

  private resolveUserId(req: {
    headers?: Record<string, unknown>;
    cookies?: Record<string, string>;
    auth?: { uid?: string };
  }): string | null {
    if (req.auth?.uid) return String(req.auth.uid);
    const token = getAccessTokenFromRequest(req as never);
    if (token) {
      const info = verifyAccessToken(token);
      if (info && typeof info === "object" && "uid" in info && info.uid) {
        return String(info.uid);
      }
    }
    return null;
  }

  @Get("list")
  list(@Query() query: Record<string, string>) {
    return this.noticeManageService.list(query);
  }

  @Get("detail/:id")
  detail(@Param("id") id: string) {
    return this.noticeManageService.detail(Number(id));
  }

  @Post("create")
  create(
    @Req()
    req: {
      headers?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
    @Body() body: Record<string, unknown>,
  ) {
    return this.noticeManageService.create(
      body as never,
      this.resolveUserId(req) || undefined,
    );
  }

  @Put("update")
  update(@Body() body: Record<string, unknown>) {
    return this.noticeManageService.update(body as never);
  }

  @Delete("delete/:id")
  remove(@Param("id") id: string) {
    return this.noticeManageService.remove(Number(id));
  }

  @Delete("batchDelete")
  batchDelete(
    @Body() body: Array<number | string> | { ids?: Array<number | string> },
  ) {
    const ids = Array.isArray(body) ? body : body?.ids || [];
    return this.noticeManageService.batchDelete(ids);
  }
}
