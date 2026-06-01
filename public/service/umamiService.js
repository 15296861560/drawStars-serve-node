const db = require("../db/mysql/base");
const Log = require("../provider/log");
const moment = require("moment-timezone");

const POSTGRESQL_DATE_FORMATS = {
    minute: "YYYY-MM-DD HH24:MI:00",
    hour: "YYYY-MM-DD HH24:00:00",
    day: "YYYY-MM-DD",
    month: "YYYY-MM-01",
    year: "YYYY-01-01",
};

const MYSQL_DATE_FORMATS = {
    minute: "%Y-%m-%d %H:%i:00",
    hour: "%Y-%m-%d %H:00:00",
    day: "%Y-%m-%d",
    month: "%Y-%m-01",
    year: "%Y-01-01",
};

function getDateQuery(field, unit, timezone) {
    if (timezone) {
        const tz = moment.tz(timezone).format("Z");

        return `DATE_FORMAT(convert_tz(${field},'+00:00','${tz}'), '${MYSQL_DATE_FORMATS[unit]}')`;
    }

    return `DATE_FORMAT(${field}, '${MYSQL_DATE_FORMATS[unit]}')`;
}

async function rawQuery(query, params = []) {

    // return prisma.$queryRaw.apply(prisma, [sql, ...params]);

    console.log("SQLSQLSQLSQLSQL", query);
    return new Promise((resolve, reject) => {
        db.selectData(query, params, (e, r) => {
            console.log("rawQuery", e, r);
            e && reject(e);
            resolve(r);
        });
    })
}

class UmamiService {
    constructor() { }

    async getPageviewStats(data) {
        const {
            website_id,
            start_at,
            end_at,
            timezone = "utc",
            unit = "day",
            count = "*",
            url,
        } = data;
        const params = [website_id, start_at, end_at];
        let urlFilter = "";

        if (url) {
            urlFilter = `and url=$${params.length + 1}`;
            params.push(decodeURIComponent(url));
        }

        const res = await rawQuery(
            `select ${getDateQuery("created_at", unit, timezone)} t,count(${count}) y from pageview where website_id=? and created_at between ? and ? ${urlFilter} group by 1 order by 1`,
            params
        );

        return res;
    }
}

module.exports = new UmamiService();
