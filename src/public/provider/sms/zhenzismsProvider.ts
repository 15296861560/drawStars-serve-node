import https from "https";
import querystring from "querystring";
import { getAppInfo } from "../../../db/app-info";

const apiUrl = "sms_developer.zhenzikj.com";
const appName = "zhenzi";

interface SmsSendParams {
  number?: string;
  templateParams?: string[];
  templateId?: string;
  appId?: string;
  appSecret?: string;
}

class ZhenzismsClient {
  apiUrl = apiUrl;
  defaultTemplateId = "12214";
  appId = "";
  appSecret = "";

  constructor() {
    this.init();
  }

  async init() {
    const appInfo = await getAppInfo(appName);
    if (appInfo?.app_id && appInfo?.app_certificate) {
      this.appId = appInfo.app_id;
      this.appSecret = appInfo.app_certificate;
    }
  }

  send(data: SmsSendParams): Promise<{ code: number; data: unknown }> {
    const options = {
      hostname: this.apiUrl,
      method: "POST",
      path: "/sms/v2/send.do",
      rejectUnauthorized: false,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };
    const payload: Record<string, string> = {
      appId: this.appId,
      appSecret: this.appSecret,
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
    };
    if (!payload.templateId) {
      payload.templateId = this.defaultTemplateId;
    }
    if (data.templateParams) {
      payload.templateParams = JSON.stringify(data.templateParams);
    }

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        res.setEncoding("utf8");
        res.on("data", (d) => {
          resolve(JSON.parse(d));
        });
      });
      req.write(querystring.stringify(payload));
      req.end();
    });
  }
}

export default new ZhenzismsClient();
