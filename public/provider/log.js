/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-08-07 22:19:24
 * @LastEditors: "lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-02 16:20:20
 */
const db = require('../db/mysql/base')
const LogService = require('../service/log-service')

// 常量
// 日志类型
const LOG_TYPE = {
    API: "api",
    REDIS: "redis",
    OPERATE: "operate",
}

// 操作类型
const OPERATION_TYPE = {
    INSERT: "insert",
    UPDATE: "update",
    DELETE: "delete",
    SELECT: "select"
}

// 业务日志类型
const BUSINESS_LOG_TYPE = {
    BUSINESS: "business",
    SYSTEM: "system",
    ERROR: "error"
}

// 日志表名
const LOG_TABLE = 'log';
// 日志字段列表
const TABLE_KEYS = ['log_type', 'hostname', 'originalUrl', 'createTime', 'content'];
// 缓存的最大日志记录
const MAX_LOG = 100;
// 自动保存日志的时间,单位毫秒
const SAVE_LOG_TIME = 60 * 1000;
// 类型长度限制
const TYPE_MAX_LENGTH = 32;
// 地址长度限制
const URL_MAX_LENGTH = 255;

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


let addLog = function (type, hostname = "", originalUrl = "", content) {
    let nowDate = new Date().getTime();
    let saveData = {
        "log_type": type.slice(0, TYPE_MAX_LENGTH),
        hostname: hostname.slice(0, URL_MAX_LENGTH),
        originalUrl: originalUrl.slice(0, URL_MAX_LENGTH),
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

// 记录操作日志
let addOperationLog = function (username, operation, method, params, ip, status = 'success', error_msg = '') {
    try {
        LogService.addOperationLog(username, operation, method, params, ip, status, error_msg);
    } catch (error) {
        console.error('记录操作日志失败:', error);
    }
}

// 记录业务日志
let addBusinessLog = function (module, type, title, content, operator) {
    try {
        LogService.addBusinessLog(module, type, title, content, operator);
    } catch (error) {
        console.error('记录业务日志失败:', error);
    }
}

// 操作日志中间件
let operationLogMiddleware = function (options = {}) {
    return function (req, res, next) {
        // 保存原始响应方法
        const originalSend = res.send;
        const originalJson = res.json;
        const originalStatus = res.status;
        
        let statusCode = 200;
        
        // 覆盖状态码方法
        res.status = function (code) {
            statusCode = code;
            return originalStatus.apply(res, arguments);
        };
        
        // 覆盖send方法
        res.send = function (body) {
            const operation = options.operation || guessOperation(req.method);
            const username = (req.user && req.user.username) || 'anonymous';
            const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            const method = req.method;
            const params = {
                body: req.body,
                query: req.query,
                url: req.url
            };
            
            const status = statusCode >= 200 && statusCode < 400 ? 'success' : 'fail';
            const error_msg = status === 'fail' ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
            
            // 记录操作日志
            addOperationLog(username, operation, method, params, ip, status, error_msg);
            
            return originalSend.apply(res, arguments);
        };
        
        // 覆盖json方法
        res.json = function (body) {
            const operation = options.operation || guessOperation(req.method);
            const username = (req.user && req.user.username) || 'anonymous';
            const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            const method = req.method;
            const params = {
                body: req.body,
                query: req.query,
                url: req.url
            };
            
            const status = statusCode >= 200 && statusCode < 400 ? 'success' : 'fail';
            let error_msg = '';
            
            if (status === 'fail') {
                error_msg = body.msg || body.message || JSON.stringify(body);
            }
            
            // 记录操作日志
            addOperationLog(username, operation, method, params, ip, status, error_msg);
            
            return originalJson.apply(res, arguments);
        };
        
        next();
    };
};

// 根据HTTP方法猜测操作类型
function guessOperation(method) {
    switch (method.toUpperCase()) {
        case 'POST':
            return OPERATION_TYPE.INSERT;
        case 'PUT':
        case 'PATCH':
            return OPERATION_TYPE.UPDATE;
        case 'DELETE':
            return OPERATION_TYPE.DELETE;
        case 'GET':
        default:
            return OPERATION_TYPE.SELECT;
    }
}

module.exports = {
    addLog,
    saveLog,
    clearLog,
    queryLogById,
    queryLogByType,
    queryAllLog,
    LOG_TYPE,
    OPERATION_TYPE,
    BUSINESS_LOG_TYPE,
    addOperationLog,
    addBusinessLog,
    operationLogMiddleware
}