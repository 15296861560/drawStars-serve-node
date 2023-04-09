/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-24 23:40:49
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-09 16:15:49
 */
const {
    getAppInfo
} = require('../../public/db/mysql/commom-api')
const AccessToken = require("./tokenBuild").AccessToken
const Log = require("./log")


let appID = "";
let appCertificate = "";
let Token = null;
const appName = "draw_stars"
const isOpenTokenVerify = false;

getAppInfo(appName).then(appInfo => {
    if (appInfo && appInfo.app_id && appInfo.app_certificate) {
        appID = appInfo.app_id;
        appCertificate = appInfo.app_certificate;
        Token = new AccessToken(appID, appCertificate)
    }
});

let verifyToken = function (token) {
    let result =false;
    try {
        let tokenInfo = JSON.parse(Token.decryption(token) || '{}');
        result=tokenInfo;
        if (tokenInfo.appID !== appID) {
            result=false;
        }
        if (tokenInfo.expireTimestamp < new Date()) {
            result=false;
        }
    } catch (e) {
        console.log(e)
        result=false;
    }
    return result;

}

let tokenVerify = function (req, res, next) {
    let type = Log.LOG_TYPE.API;
    let hostname = req.hostname;
    let originalUrl = req.originalUrl;
    let urlArray = originalUrl.split("/");
    let content = {
        module: urlArray[0],
        methods: urlArray.slice(-1)[0]
    };
    Log.addLog(type, hostname, originalUrl, content);

    if (req.originalUrl.startsWith('/loginApi')) {
        next()
    } else {
        let token = req.headers.accesstoken

        if (isOpenTokenVerify && (!token || !verifyToken(token))) {
            res.status(200).json({
                "status": false,
                "msg": "token验证未通过",
                "code": "TOKEN-FAIL",
            });
            return
        }
        next();
    }

}

module.exports = {tokenVerify,verifyToken};