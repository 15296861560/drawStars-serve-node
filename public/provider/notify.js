const db = require('../db/mysql/base')
const NOTIFY_TABLE = "notify"

const addNotify = function (sendId, receiveId, notifyType, notifyMsg) {
    return new Promise((resolve, reject) => {
        let curTime = new Date().getTime();
        let saveData = {
            send_id: Number(sendId),
            receive_id: Number(receiveId),
            notify_type: notifyType,
            notify_msg: notifyMsg,
            create_time: curTime,
            update_time: curTime,
            create_by: Number(sendId),
            update_by: Number(sendId),
        }
        db.insertData(NOTIFY_TABLE, saveData, (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}

const queryNotifyById = function (notify_id) {
    return new Promise((resolve, reject) => {
        let values = [notify_id];
        db.selectData(`select * from ${NOTIFY_TABLE} where notify_id = ?`, values, (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}
const queryNotifyByType = function (notifyType) {
    return new Promise((resolve, reject) => {
        let values = [notifyType];
        db.selectData(`select * from ${NOTIFY_TABLE} where notify_type = ?`, values, (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}
const queryMyNotifyByType = function (notifyType, userId) {
    return new Promise((resolve, reject) => {
        let values = [notifyType, userId];
        db.selectData(`select * from ${NOTIFY_TABLE} where notify_type = ? and receive_id = ?`, values, (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}
const queryAllNotify = function () {
    return new Promise((resolve, reject) => {
        db.selectData(`select * from ${NOTIFY_TABLE} `, [], (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}
const queryMyAllNotify = function (userId) {
    return new Promise((resolve, reject) => {
        db.selectData(`select * from ${NOTIFY_TABLE} where receive_id = ?`, [userId], (e, r) => {
            if (e) {
                reject(e)
            }
            resolve(r);
        })
    })
}


module.exports = {
    addNotify,
    queryNotifyById,
    queryNotifyByType,
    queryMyNotifyByType,
    queryAllNotify,
    queryMyAllNotify
}