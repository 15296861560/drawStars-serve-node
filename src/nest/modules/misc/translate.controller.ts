import { Body, Controller, Post } from "@nestjs/common";
import { getAppInfo } from "../../../db/app-info";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MD5 } = require("../../../../public/baidu/md5");

@Controller("translateApi")
export class TranslateController {
  @Post("getSign")
  async getSign(@Body() body: { contents: string; salt: string }) {
    const appInfo = await getAppInfo("baidu_translate");
    const appID = appInfo?.app_id || "";
    const appCertificate = appInfo?.app_certificate || "";
    const str = appID + body.contents + body.salt + appCertificate;
    const sign = MD5(str);

    return {
      status: true,
      data: { appID, sign },
    };
  }
}
