const db = require('../db/mysql/base')
const NOTIFY_TABLE = "notify"

const addNotify = function (sendId, receiveId, notifyType, notifyMsg) {
    let curTime = new Date().getTime();
    let saveData = {
        send_id: Number(sendId) ,
        receive_id: Number(receiveId),
        notify_type: notifyType,
        notify_msg: notifyMsg,
        create_time: curTime,
        update_time: curTime,
        create_by: Number(sendId),
        update_by: Number(sendId),
    }
    db.insertData(NOTIFY_TABLE, saveData, (e, r) => {
        console.log(e)
    })
}

const queryNotifyById = function (notify_id) {
    let values = [notify_id];
    db.selectData(`select * from ${NOTIFY_TABLE} where notify_id = ?`, values, (e, r) => {
        console.log("querySingleNotify", r)
    })
}

const queryNotifyByType = function (notifyType) {
    let values = [notifyType];
    db.selectData(`select * from ${NOTIFY_TABLE} where notify_type = ?`, values, (e, r) => {
        console.log("queryNotifyByType", r)
    })
}
const queryAllNotify = function () {
    db.selectData(`select * from ${NOTIFY_TABLE} `, [], (e, r) => {
        console.log("queryAllNotify", r)
    })
}


module.exports = {
    addNotify,
    queryNotifyById,
    queryNotifyByType,
    queryAllNotify
}