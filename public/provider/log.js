/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-08-07 22:19:24
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-09 16:23:40
 */
const db = require('../db/mysql/base')

// 常量
// 日志类型
const LOG_TYPE = {
    API: "api",
    REDIS: "redis"
}
// 日志表名
const LOG_TABLE = 'log';
// 日志字段列表
const TABLE_KEYS = ['log_type', 'hostname', 'originalUrl', 'createTime', 'content'];
// 缓存的最大日志记录
const MAX_LOG = 100;
// 自动保存日志的时间,单位毫秒
const SAVE_LOG_TIME = 60 * 1000;

// 变量

const handler = {
    set: async function (target, prop, value) {
        if (target.length < MAX_LOG) {
            target[prop] = value;
            return true;
        } else {
            target[prop] = value;
            await batchSaveLogs(target);
            return true;
        }
    },
};
// 日志记录
let records = new Proxy([], handler);

// 定时保存日志的定时器
setInterval(() => {
    if (records.length > 0) {
        batchSaveLogs(records);
    }
}, SAVE_LOG_TIME)


let addLog = function (type, hostname, originalUrl, content) {
    let nowDate = new Date().getTime();
    let saveData = {
        "log_type": type,
        hostname,
        originalUrl,
        "createTime": nowDate,
        content: JSON.stringify(content)
    };
    records.push(saveData)
}

let batchSaveLogs = async function (logRecords) {
    let datas = [];
    logRecords.forEach(record => {
        datas.push(Object.values(record))
    });
    db.batchInsertData(LOG_TABLE, TABLE_KEYS, datas, (e, r) => {
        console.log(e)
    })
    logRecords.length = 0;

}

let saveLog = function (saveData) {
    db.insertData(LOG_TABLE, saveData, (e, r) => {
        console.log(e)
    })
}

let clearLog = function () {
    batchSaveLogs(records)
}

let queryLogById = function (log_id) {
    let values = [log_id];
    db.selectData('select * from log where log_id = ?', values, (e, r) => {
        console.log("querySingleLog", r)
    })
}

let queryLogByType = function () {
    let values = [log_id];
    db.selectData('select * from log where log_id = ?', values, (e, r) => {
        console.log("queryLogByType", r)
    })
}
let queryAllLog = function () {
    db.selectData('select * from log ', [], (e, r) => {
        console.log("queryAllLog", r)
    })
}

module.exports = {
    addLog,
    saveLog,
    clearLog,
    queryLogById,
    queryLogByType,
    queryAllLog,
    LOG_TYPE
}