import { Injectable } from "@nestjs/common";
import axios from "axios";
import { getAppInfo } from "../../../db/app-info";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MD5 } = require("../../../../public/baidu/md5");

export interface BaiduTranslateResult {
  src: string;
  dst: string;
  from: string;
  to: string;
}

export interface BaiduWeatherResult {
  city: string;
  text: string;
  temp: string;
  feelsLike?: string;
  rh?: string;
  windClass?: string;
  aqi?: string;
  detailHtml: string;
}

@Injectable()
export class AiAssistantBaiduService {
  async translate(
    text: string,
    from = "auto",
    to = "zh",
  ): Promise<BaiduTranslateResult | null> {
    const appInfo = await getAppInfo("baidu_translate");
    if (!appInfo?.app_id || !appInfo?.app_certificate) {
      return null;
    }

    const salt = String(Math.floor(Math.random() * 100000));
    const sign = MD5(appInfo.app_id + text + salt + appInfo.app_certificate);

    try {
      const { data } = await axios.get(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        {
          params: {
            q: text,
            from,
            to,
            appid: appInfo.app_id,
            salt,
            sign,
          },
          timeout: 15000,
        },
      );

      if (data?.error_code) {
        console.error("[baidu-translate]", data.error_code, data.error_msg);
        return null;
      }

      const item = data?.trans_result?.[0];
      if (!item) return null;

      return {
        src: item.src,
        dst: item.dst,
        from: data.from || from,
        to: data.to || to,
      };
    } catch (error) {
      console.error("[baidu-translate] request failed:", error);
      return null;
    }
  }

  /** 从用户句子里抽取待翻译文本 */
  extractTranslateQuery(text: string): string {
    return text
      .replace(/^翻译[：:\s]*/i, "")
      .replace(/^translate[：:\s]*/i, "")
      .trim();
  }

  /** 从用户句子里抽取城市名 */
  extractCity(text: string): string {
    const m = text.match(/([\u4e00-\u9fa5]{2,8})(的)?天气/);
    if (m?.[1]) return m[1];
    const m2 = text.match(/天气[怎么样]?[：:\s]*([\u4e00-\u9fa5]{2,8})/);
    if (m2?.[1]) return m2[1];
    return "上海";
  }

  async getWeather(city: string): Promise<BaiduWeatherResult | null> {
    const appInfo = await getAppInfo("baidu_map");
    const ak = appInfo?.app_certificate || appInfo?.app_id;
    if (!ak) {
      return null;
    }

    try {
      const geo = await axios.get(
        "https://api.map.baidu.com/geocoding/v3/",
        {
          params: {
            address: city,
            output: "json",
            ak,
          },
          timeout: 15000,
        },
      );

      const geoResult = geo.data?.result;
      if (geo.data?.status !== 0 || !geoResult?.location) {
        console.error("[baidu-weather] geocode:", geo.data);
        return null;
      }

      const adcode = geoResult.adcode || geoResult.addressComponent?.adcode;
      const { lng, lat } = geoResult.location;

      const weather = await axios.get("https://api.map.baidu.com/weather/v1/", {
        params: {
          district_id: adcode,
          location: `${lat},${lng}`,
          data_type: "all",
          ak,
        },
        timeout: 15000,
      });

      if (weather.data?.status !== 0) {
        console.error("[baidu-weather] weather:", weather.data);
        return null;
      }

      const now = weather.data?.result?.now;
      const loc = weather.data?.result?.location;
      const cityName = loc?.name || city;
      const textDesc = now?.text || "—";
      const temp = now?.temp != null ? `${now.temp}°C` : "—";

      const detailHtml = `<p><strong>${cityName}</strong> · ${textDesc} · <span style="color:#409EFF;font-size:1.15em">${temp}</span></p><p>体感 ${now?.feels_like ?? "—"}°C · 湿度 ${now?.rh ?? "—"}% · 风力 ${now?.wind_class ?? "—"} · AQI ${now?.aqi ?? "—"}</p>`;

      return {
        city: cityName,
        text: textDesc,
        temp,
        feelsLike: now?.feels_like,
        rh: now?.rh,
        windClass: now?.wind_class,
        aqi: now?.aqi,
        detailHtml,
      };
    } catch (error) {
      console.error("[baidu-weather] request failed:", error);
      return null;
    }
  }
}
