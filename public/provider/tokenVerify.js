/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-24 23:40:49
 * @LastEditors: lgy
 * @LastEditTime: 2022-08-07 16:17:15
 */
const {
    getAppInfo
} = require('../../public/db/mysql/commom-api')
const AccessToken = require("./tokenBuild").AccessToken


let appID = "";
let appCertificate = "";
let Token = null;
const appName = "draw_stars"

getAppInfo(appName).then(appInfo => {
    if (appInfo && appInfo.app_id && appInfo.app_certificate) {
        appID = appInfo.app_id;
        appCertificate = appInfo.app_certificate;
        Token = new AccessToken(appID, appCertificate)
    }
});

let verifyToken = function (token) {
    try {
        let tokenInfo = JSON.parse(Token.decryption(token) || '{}');
        if (tokenInfo.appID !== appID) {
            return false;
        }
        if (tokenInfo.expireTimestamp < new Date()) {
            return false;
        }
    } catch (e) {
        return false;
    }

    return true;

}

let tokenVerify = function (req, res, next) {
    if (req.originalUrl.startsWith('/loginApi')) {
        next()
    } else {
        let token = req.headers.accesstoken

        if (!token || !verifyToken(token)) {
            res.status(200).json({
                "status": false,
                "msg": "token验证未通过",
                "data": "token验证未通过",
            });
            return
        }
        next();
    }

}

module.exports = tokenVerify;