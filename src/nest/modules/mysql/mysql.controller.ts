import { Body, Controller, Post } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { MysqlService } from "./mysql.service";

@Controller("mysqlApi")
export class MysqlController {
  constructor(private readonly mysqlService: MysqlService) {}

  @Public()
  @Post("login")
  async login(@Body() body: { name: string; password: string }) {
    try {
      return await this.mysqlService.login(body.name, body.password);
    } catch (error) {
      return {
        status: false,
        msg: "登录失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Public()
  @Post("register")
  async register(@Body() body: { name: string; password: string; phone: string }) {
    try {
      return await this.mysqlService.register(body);
    } catch (error) {
      return {
        status: false,
        msg: "注册失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post("cancel")
  async cancel(@Body() body: { phone: string }) {
    try {
      return await this.mysqlService.cancel(body.phone);
    } catch (error) {
      return {
        status: false,
        msg: "删除失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post("modify")
  async modify(@Body() body: { phone: string; pwd: string }) {
    try {
      return await this.mysqlService.modify(body.phone, body.pwd);
    } catch (error) {
      return {
        status: false,
        msg: "修改失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post("query")
  async query() {
    try {
      return await this.mysqlService.query();
    } catch (error) {
      return {
        status: false,
        msg: "查询失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post("sql")
  async sql(@Body() body: { sql: string; values?: unknown[] }) {
    try {
      return await this.mysqlService.sql(body.sql, body.values || []);
    } catch (error) {
      return {
        status: false,
        msg: "执行失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
