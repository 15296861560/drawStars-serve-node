import moment from "moment-timezone";
import { rawQuery } from "../../db/raw-query";

const MYSQL_DATE_FORMATS: Record<string, string> = {
  minute: "%Y-%m-%d %H:%i:00",
  hour: "%Y-%m-%d %H:00:00",
  day: "%Y-%m-%d",
  month: "%Y-%m-01",
  year: "%Y-01-01",
};

function getDateQuery(field: string, unit: string, timezone?: string) {
  if (timezone) {
    const tz = moment.tz(timezone).format("Z");
    return `DATE_FORMAT(convert_tz(${field},'+00:00','${tz}'), '${MYSQL_DATE_FORMATS[unit]}')`;
  }
  return `DATE_FORMAT(${field}, '${MYSQL_DATE_FORMATS[unit]}')`;
}

interface PageviewStatsParams {
  website_id: string | number;
  start_at: string;
  end_at: string;
  timezone?: string;
  unit?: string;
  count?: string;
  url?: string;
}

class UmamiService {
  async getPageviewStats(data: PageviewStatsParams) {
    const {
      website_id,
      start_at,
      end_at,
      timezone = "utc",
      unit = "day",
      count = "*",
      url,
    } = data;
    const params: unknown[] = [website_id, start_at, end_at];
    let urlFilter = "";

    if (url) {
      urlFilter = "and url=?";
      params.push(decodeURIComponent(url));
    }

    const dateQuery = getDateQuery("created_at", unit, timezone);
    const query = `select ${dateQuery} t, count(${count}) y from pageview where website_id=? and created_at between ? and ? ${urlFilter} group by 1 order by 1`;

    return rawQuery(query, params);
  }
}

export default new UmamiService();
