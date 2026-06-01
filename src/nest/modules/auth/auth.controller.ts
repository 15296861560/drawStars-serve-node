import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { AuthService } from "./auth.service";

@Public()
@Controller("loginApi")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("loginByPassword")
  async loginByPassword(
    @Body() body: { phone: string; password: string },
  ): Promise<unknown> {
    try {
      const data = await this.authService.loginByPassword(body.phone, body.password);
      return { status: true, msg: "登录成功", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  @Post("loginBySMS")
  async loginBySMS(@Body() body: { phone: string; captcha: string }) {
    try {
      const data = await this.authService.loginBySms(body.phone, body.captcha);
      return { status: true, msg: "登录成功", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }

  @Post("registerByPhone")
  async registerByPhone(@Body() body: Record<string, unknown>) {
    try {
      const nowDate = Date.now();
      const payload: Record<string, unknown> = {
        name: body.name,
        password: body.password,
        phone: body.phone,
        createTime: nowDate,
        updateTime: nowDate,
        level: 1,
      };
      const data = await this.authService.registerByPhone(payload);
      return { status: true, msg: "注册成功", data };
    } catch (error) {
      return {
        status: false,
        msg: `注册失败:${error instanceof Error ? error.message : String(error)}`,
        data: null,
      };
    }
  }

  @Get("verifyLogin")
  async verifyLogin(@Req() req: { headers: Record<string, unknown>; query: Record<string, unknown>; cookies?: Record<string, string> }) {
    try {
      const data = await this.authService.verifyLogin(req);
      return { status: true, msg: "ok", data };
    } catch {
      return { status: false, msg: "fail", data: null };
    }
  }

  @Get("getCaptcha")
  async getCaptcha(@Query("account") account: string, @Query("type") type?: string) {
    try {
      const ok = await this.authService.getCaptcha(account, type || "login");
      return { status: !!ok, msg: "ok", data: null };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }
}
