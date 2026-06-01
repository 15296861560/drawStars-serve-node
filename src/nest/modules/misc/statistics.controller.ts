import { Controller, Get, Query } from "@nestjs/common";
import umamiService from "../../../public/service/umamiService";

@Controller("statisticsApi")
export class StatisticsController {
  @Get("getPageviewStats")
  async getPageviewStats(@Query() query: Record<string, unknown>) {
    try {
      const data = await umamiService.getPageviewStats(
        query as unknown as Parameters<typeof umamiService.getPageviewStats>[0],
      );
      return { status: true, msg: "ok", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  }
}
