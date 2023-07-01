/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-06-28 23:17:13
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-02 01:44:34
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\public\service\userService.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
const db = require('../db/mysql/base');
const Log = require("../provider/log");
const AccessToken = require("../provider/tokenBuild").AccessToken;
const {
    getAppInfo
} = require('../db/mysql/commom-api')

const USER_TABLE_NAME = 'user';
const BACKEND = 'backend';
const appName = "draw_stars";

class UserService {
    constructor() {
        this.appID = "";
        this.appCertificate = "";
        this.Token = null;

        this.init();
    }

    async init() {
        const appInfo = await getAppInfo(appName);
        if (appInfo && appInfo.app_id && appInfo.app_certificate) {
            this.appID = appInfo.app_id;
            this.appCertificate = appInfo.app_certificate;
            this.Token = new AccessToken(this.appID, this.appCertificate)
        }
    }


    queryUserByCondition(condition, value) {
        return new Promise((resolve, reject) => {
            db.selectData(`select * from user where ${condition} = ?`, [value], (e, r) => {
                const content = {
                    method: 'queryUserByCondition',
                    condition,
                    value,
                    result: e || true
                };
                Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, content);
                e && reject(e);
                if (r?.length) {
                    resolve(r[0]);
                } else {
                    resolve(null);
                }
            })
        })
    }



    async queryUserById(id) {
        const userInfo = await this.queryUserByCondition('id', id);
        return userInfo;
    }

    async queryUserByPhone(phone) {
        const userInfo = await this.queryUserByCondition('phone', phone);
        return userInfo;
    }


    createUser(userInfo) {
        return new Promise((resolve, reject) => {
            db.insertData(USER_TABLE_NAME, userInfo, async (e, r) => {
                const content = {
                    method: 'createUser',
                    userInfo,
                    result: e || true
                };
                Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, content);
                e ? reject(e) : resolve(r);
            })
        })
    }

    setToken(userInfo) {
        userInfo.token = this.Token.build(userInfo.id);
    }

    async loginByPassword(phone, password) {
        let userInfo = await this.queryUserByPhone(phone);

        if (!userInfo) {
            throw ("账号不存在");
        }
        if (password !== userInfo.password) {
            throw ("密码错误");
        }

        this.setToken(userInfo);
        return userInfo;
    }

    async registerByCondition(condition, saveData) {
        const userInfo = await this.queryUserByCondition(condition, saveData[condition]);
        if (userInfo) {
            throw (`用户${userInfo.name}已注册`);
        }

        const registerRes = await this.createUser(saveData);
        return registerRes;
    }

    async registerByPhone(saveData) {
        const registerRes = await this.registerByCondition('phone', saveData);
        return registerRes;
    }

}
module.exports = new UserService()