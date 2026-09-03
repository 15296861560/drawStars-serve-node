import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { ImAuthService } from "./im-auth.service";
import { serializeBigInt } from "../../../../lib/serialize";

@Controller("im")
export class ImAuthController {
  constructor(private readonly authService: ImAuthService) {}

  private uid(req: any): string {
    const u = req.auth?.uid;
    if (u == null || u === "") throw new Error("未登录");
    return String(u);
  }

  /** 签发访问 Token（REST） */
  @Post("token")
  async token(@Req() req: any) {
    const uid = this.uid(req);
    const token = this.authService.issueAccessToken(uid);
    return { status: true, msg: "ok", data: { accessToken: token } };
  }

  /** 签发短时 WS 连接 Ticket */
  @Post("ws-ticket")
  async wsTicket(@Req() req: any) {
    const uid = this.uid(req);
    const ticket = await this.authService.issueWsTicket(uid);
    return { status: true, msg: "ok", data: { ticket } };
  }

  /** 续签（重新签发，等同 token） */
  @Post("token/refresh")
  async refresh(@Req() req: any) {
    const uid = this.uid(req);
    const token = this.authService.issueAccessToken(uid);
    return { status: true, msg: "ok", data: { accessToken: token } };
  }

  /** 登出：失效 WS 由 gateway 监听处理 */
  @Post("logout")
  async logout() {
    return { status: true, msg: "已登出", data: null };
  }

  /** 资料 */
  @Get("profile")
  async getProfile(@Req() req: any) {
    const uid = this.uid(req);
    const profile = await this.authService.getProfile(uid);
    return { status: true, msg: "ok", data: serializeBigInt(profile) };
  }

  @Post("profile")
  async updateProfile(@Req() req: any, @Body() body: Record<string, unknown>) {
    const uid = this.uid(req);
    const profile = await this.authService.updateProfile(uid, body);
    return { status: true, msg: "ok", data: serializeBigInt(profile) };
  }

  /** 批量在线状态 */
  @Get("users/status")
  async usersStatus(@Req() req: any, @Query("userIds") userIds: string) {
    const uid = this.uid(req);
    const ids = String(userIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const status = await this.authService.batchStatus(uid, ids);
    return { status: true, msg: "ok", data: status };
  }
}
