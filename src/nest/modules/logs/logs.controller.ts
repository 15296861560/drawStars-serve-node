import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { LogsService } from "./logs.service";
import { LOG_TYPE } from "../../../public/provider/log";

@Controller("logApi")
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("queryLoginLogs")
  async queryLoginLogs(@Query() query: Record<string, string>) {
    try {
      return await this.logsService.queryLoginLogs(query);
    } catch (error) {
      return {
        status: false,
        msg: "查询登录日志失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("queryOperationLogs")
  async queryOperationLogs(@Query() query: Record<string, string>) {
    try {
      return await this.logsService.queryByType(LOG_TYPE.OPERATE, query);
    } catch (error) {
      return {
        status: false,
        msg: "查询操作日志失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("queryBusinessLogs")
  async queryBusinessLogs(@Query() query: Record<string, string>) {
    try {
      return await this.logsService.queryByType(LOG_TYPE.BUSINESS, query);
    } catch (error) {
      return {
        status: false,
        msg: "查询业务日志失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("queryApiLogs")
  async queryApiLogs(@Query() query: Record<string, string>) {
    try {
      return await this.logsService.queryByType(LOG_TYPE.API, query);
    } catch (error) {
      return {
        status: false,
        msg: "查询接口日志失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("queryPerformanceLogs")
  async queryPerformanceLogs(@Query() query: Record<string, string>) {
    try {
      return await this.logsService.queryByType(LOG_TYPE.PERFORMANCE, query);
    } catch (error) {
      return {
        status: false,
        msg: "查询性能日志失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("getLogStatistics")
  async getLogStatistics() {
    try {
      return await this.logsService.getLogStatistics();
    } catch (error) {
      return {
        status: false,
        msg: "获取统计失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("deleteLog")
  async deleteLog(@Query("id") id: string) {
    try {
      return await this.logsService.deleteLog(id);
    } catch (error) {
      return {
        status: false,
        msg: "删除失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get("batchDeleteLogs")
  async batchDeleteLogs(@Query("ids") ids: string) {
    try {
      return await this.logsService.batchDeleteLogs(ids);
    } catch (error) {
      return {
        status: false,
        msg: "批量删除失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 前端埋点：页面访问 / 点击事件等 */
  @Public()
  @Post("track")
  async track(
    @Body()
    body: {
      type?: string;
      event?: string;
      path?: string;
      title?: string;
      module?: string;
      username?: string;
      extra?: Record<string, unknown>;
    },
    @Req() req: Request,
  ) {
    try {
      return this.logsService.track({
        ...body,
        hostname: req.hostname,
        path: body.path || req.headers.referer || "",
      });
    } catch (error) {
      return {
        status: false,
        msg: "埋点失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Public()
  @Get("exportLogs")
  async exportLogs(@Query() query: Record<string, string>) {
    try {
      const logType = query.logType || LOG_TYPE.OPERATE;
      const result = await this.logsService.queryByType(logType, {
        ...query,
        curPage: 1,
        pageSize: 1000,
      });
      return result;
    } catch (error) {
      return {
        status: false,
        msg: "导出失败",
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
