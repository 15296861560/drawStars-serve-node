/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-06-28 23:18:10
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-09 23:24:05
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\public\provider\oauth\githubProvider.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
const axios = require('axios');
const {
    getAppInfo
} = require('../../db/mysql/commom-api');
const config = require('../../../config/publish-config')
const SERVE_PORT = config['serve_port'] //发布端口

const appName = "github";
const REDIRECT_URI=`http://127.0.0.1:${SERVE_PORT}`;

class GithubProvider {
    constructor() {
        this.appID = "";
        this.appCertificate = "";

        this.init();
    }

    async init() {
        const appInfo = await getAppInfo(appName);
        if (appInfo && appInfo.app_id && appInfo.app_certificate) {
            this.appID = appInfo.app_id;
            this.appCertificate = appInfo.app_certificate;
        }
    }

    async getAccessToken(code, state) {
        const params = {
            client_id: this.appID,
            client_secret: this.appCertificate,
            code,
            redirect_uri: `${REDIRECT_URI}/loginApi/oauthLogin/github`,
            state
        }
        let accessToken = "";
        let res = await axios.post('https://github.com/login/oauth/access_token', null, {
            params,
            headers: {
                Accept: 'application/json',
            }
        });

        if (res.status) {
            accessToken = res.data.access_token;
        }
        return accessToken;
    }

    async queryGithubUserInfo(accessToken) {
        let res = await axios.get(`https://api.github.com/user?access_token=${accessToken}`, {
            headers: {
                'Authorization': 'token ' + accessToken
            }
        })

        return res.data;
    }
}

module.exports = new GithubProvider()