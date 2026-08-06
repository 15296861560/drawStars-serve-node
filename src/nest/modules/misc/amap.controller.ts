import { Controller, Get } from "@nestjs/common";
import { getAppInfo } from "../../../db/app-info";
import { Public } from "../../common/decorators/public.decorator";

/**
 * 高德地图凭证：
 * app_name = amap
 * app_id = Web端 Key（JS API）
 * app_certificate = 安全密钥 securityJsCode
 * app_version = Web服务 Key（REST，可选）
 */
@Controller("amapApi")
export class AmapController {
  @Public()
  @Get("getMapApiKey")
  async getMapApiKey() {
    const appInfo = await getAppInfo("amap");
    if (!appInfo?.app_id) {
      return {
        status: false,
        msg: "未配置高德地图（app_info.amap）",
        data: null,
      };
    }
    return {
      status: true,
      msg: "success",
      data: {
        key: appInfo.app_id,
        securityJsCode: appInfo.app_certificate || "",
        webServiceKey: appInfo.app_version || "",
      },
    };
  }
}
