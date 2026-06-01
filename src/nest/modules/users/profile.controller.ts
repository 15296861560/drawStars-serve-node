import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("profileApi")
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get("queryUserInfo")
  async queryUserInfo(@Query("id") id: string) {
    if (!id) {
      return { status: false, msg: "缺少用户 id", data: null };
    }
    const data = await this.usersService.queryUserInfo(Number(id));
    return { status: true, msg: "ok", data };
  }

  @Post("updateUserInfo")
  async updateUserInfo(
    @Body()
    body: {
      id: number;
      name?: string;
      introduction?: string;
      birthday?: string;
      region?: string;
      gender?: string;
    },
  ) {
    try {
      await this.usersService.updateUserInfo(body.id, {
        name: body.name,
        introduction: body.introduction,
        birthday: body.birthday,
        region: body.region,
        gender: body.gender,
      });
      return { status: true, msg: "修改成功", data: null };
    } catch (error) {
      return {
        status: false,
        msg: "修改失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post("changePassword")
  async changePassword(
    @Body() body: { id: number; password: string; newPassword: string },
  ) {
    const ok = await this.usersService.changePassword(
      body.id,
      body.password,
      body.newPassword,
    );
    if (!ok) {
      return { status: false, msg: "校验失败", data: "密码错误" };
    }
    return { status: true, msg: "修改成功", data: null };
  }

  @Post("changePhone")
  async changePhone(@Body() body: { id: number; phone: string }) {
    try {
      await this.usersService.updateUserInfo(body.id, { phone: body.phone });
      return { status: true, msg: "修改成功", data: null };
    } catch (error) {
      return {
        status: false,
        msg: "修改失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
