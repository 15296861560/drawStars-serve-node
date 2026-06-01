import { Controller, Get } from "@nestjs/common";
import { getAppInfo } from "../../../db/app-info";

@Controller("baiduApi")
export class BaiduController {
  @Get("getMapApiKey")
  async getMapApiKey() {
    const appInfo = await getAppInfo("baidu_map");
    return {
      status: true,
      msg: "success",
      data: appInfo?.app_certificate,
    };
  }
}
