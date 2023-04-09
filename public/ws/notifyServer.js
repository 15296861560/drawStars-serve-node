/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-02-26 17:43:48
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-09 22:21:44
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\public\ws\notifyServer.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
const notifyServer = require("drawstarts-notify-serve")
const Log = require("../provider/log")
const Notify = require("../provider/notify")
const verifyToken = require('../provider/tokenVerify').verifyToken
const config = require('../../config/publish-config')
const port = config['notify_port']

notifyServer.init({
    config: {
        port
    },
    verifyToken: verifyToken,
    addLog: Log.addLog,
    addNotify: Notify.addNotify,
});