const db = require('../db/mysql/base');
const Log = require("../provider/log");
const AccessToken = require("../provider/tokenBuild").AccessToken;
const {
    getAppInfo
} = require('../db/mysql/commom-api');

const zhenzismsClient = require('../provider/sms/zhenzismsProvider.js');

const userRedisClient = require('../db/redis/client')

const USER_TABLE_NAME = 'user';
const OAUTH_TABLE_NAME = 'oauth_info';
const LoginLog = require('../provider/log/login-log');

const BACKEND = 'backend';
const APPNAME = "draw_stars";
const DEFAULT_PASSWORD = "@drawStars123";

class UserService {
    constructor() {
        this.appID = "";
        this.appCertificate = "";
        this.Token = null;

        this.init();
    }

    async init() {
        const appInfo = await getAppInfo(APPNAME);
        if (appInfo && appInfo.app_id && appInfo.app_certificate) {
            this.appID = appInfo.app_id;
            this.appCertificate = appInfo.app_certificate;
            this.Token = new AccessToken(this.appID, this.appCertificate)
        }
    }

    async recordLoginLog(username, ip, status, details = '') {
        try {
            // 获取用户代理字符串
            const userAgent = global.userAgent || '';
            
            // 解析用户代理获取浏览器和操作系统信息
            let browser = '';
            let os = '';
            
            if (userAgent) {
                // 简单解析用户代理字符串
                if (userAgent.includes('Firefox')) {
                    browser = 'Firefox';
                } else if (userAgent.includes('Chrome')) {
                    browser = 'Chrome';
                } else if (userAgent.includes('Safari')) {
                    browser = 'Safari';
                } else if (userAgent.includes('Edge')) {
                    browser = 'Edge';
                } else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
                    browser = 'Internet Explorer';
                } else {
                    browser = '未知';
                }
                
                if (userAgent.includes('Windows')) {
                    os = 'Windows';
                } else if (userAgent.includes('Mac OS')) {
                    os = 'MacOS';
                } else if (userAgent.includes('Linux')) {
                    os = 'Linux';
                } else if (userAgent.includes('Android')) {
                    os = 'Android';
                } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
                    os = 'iOS';
                } else {
                    os = '未知';
                }
            }
            
            // 获取地理位置信息 - 这里使用简单的IP分析
            let location = '';
            if (ip) {
                if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1') {
                    location = '内网IP';
                } else {
                    // 这里可以接入IP地址库或API进行更精确的地理位置解析
                    // 目前只做简单分类
                    location = '外网IP';
                }
            }
            
            await LoginLog.create({
                username,
                ip,
                location,
                browser,
                os,
                status, // 'success' 或 'fail'
                details
            });
        } catch (error) {
            console.error('记录登录日志失败:', error);
            // 登录日志记录失败不影响主流程
        }
    }

    queryUserByCondition(condition, value) {
        let table = USER_TABLE_NAME;
        if (condition === 'oauth') {
            table = OAUTH_TABLE_NAME;
            condition = "open_id";
        }
        return new Promise((resolve, reject) => {
            db.selectData(`select * from ${table} where ${condition} = ?`, [value], (e, r) => {
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
        if (!userInfo.password) {
            userInfo.password = DEFAULT_PASSWORD;
        }
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

    async loginByPassword(phone, password, ip) {
        let userInfo = await this.queryUserByPhone(phone);

        if (!userInfo) {
            await this.recordLoginLog(phone, ip, 'fail', '账号不存在');
            throw ("账号不存在");
        }
        if (password !== userInfo.password) {
            await this.recordLoginLog(userInfo.name || phone, ip, 'fail', '密码错误');
            throw ("密码错误");
        }

        this.setToken(userInfo);
        await this.recordLoginLog(userInfo.name || phone, ip, 'success');
        return userInfo;
    }

    async registerByCondition(condition, saveData, value) {
        const userInfo = await this.queryUserByCondition(condition, value);
        if (userInfo) {
            throw (`用户${userInfo.name}已注册`);
        }

        const registerRes = await this.createUser(saveData);
        return registerRes;
    }

    async registerByPhone(saveData) {
        await this.registerByCondition('phone', saveData, saveData.phone);
        const userId = await db.getInsertId();
        return userId;
    }

    async createOauthUser(oauthInfo = {}) {
        const nowDate = new Date().getTime();
        oauthInfo.create_time = nowDate;
        oauthInfo.update_time = nowDate;
        return new Promise((resolve, reject) => {
            db.insertData(OAUTH_TABLE_NAME, oauthInfo, async (e, r) => {
                const content = {
                    method: 'createOauthUser',
                    oauthInfo,
                    result: e || true
                };
                Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, content);
                e ? reject(e) : resolve(r);
            })
        })
    }

    async queryByOauth(thirdPartyId) {
        const oauthInfo = await this.queryUserByCondition('oauth', thirdPartyId);
        return oauthInfo;
    }

    async registerByOauth(saveData, platform, thirdPartyId) {
        let userId = "";
        try {
            await this.registerByCondition('oauth', saveData, thirdPartyId);
            userId = await db.getInsertId();
            const oauthInfo = {
                platform,
                user_id: userId,
                open_id: thirdPartyId
            };
            await this.createOauthUser(oauthInfo);
        } catch (e) {
            const content = {
                method: 'registerByOauth',
                oauthInfo,
                result: e
            };
            Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, content);
            return false;
        }

        return {
            userId
        };
    }


    async verifyLogin(token) {
        const tokenInfo = JSON.parse(this.Token.decryption(token) || '{}');
        if (tokenInfo.appID !== this.appID) {
            return false;
        }
        if (tokenInfo.expireTimestamp < new Date()) {
            return false;
        }

        const {
            uid
        } = tokenInfo;
        const userInfo = await this.queryUserById(uid);

        return userInfo;
    }

    // 获取验证码
    async getCaptcha(phone, type = 'login') {
        try {
            const params = {};
            const code = String(Math.floor(Math.random() * 8999) + 1000);
            const expireMins = 2;
            const expireSeconds = expireMins * 60;
            const redisKey = `${type}-${phone}`;
            if (await redisClient.exists(redisKey)) {
                throw ('验证码未过期，请稍后重试');
            }
            userRedisClient.set(redisKey, code);
            redisClient.expire(redisKey, expireSeconds)
            params.number = phone;
            params.templateParams = [code, `${expireMins}分钟`];
            const res = await zhenzismsClient.send(params);
            if (res.code === 0) {
                return true;
            } else {
                throw (res.data);
            }

        } catch (e) {
            const content = {
                method: 'getCaptcha',
                result: e
            };
            Log.addLog(Log.LOG_TYPE.API, BACKEND, BACKEND, content);
            throw (e);
        }

    }

    // 验证验证码
    async verifyCaptcha(phone, captcha, type = 'login') {
        const redisKey = `${type}-${phone}`;
        const code = redisClient.get(redisKey);
        const flag = captcha == code;
        return flag;
    }


    async smsLogin(phone, captcha, ip) {
        if (!this.verifyCaptcha(phone, captcha)) {
            await this.recordLoginLog(phone, ip, 'fail', '验证码错误');
            throw ("验证码错误");
        }
        let userInfo = await this.queryUserByPhone(phone);

        if (!userInfo) {
            await this.recordLoginLog(phone, ip, 'fail', '账号不存在');
            throw ("账号不存在");
        }

        this.setToken(userInfo);
        await this.recordLoginLog(userInfo.name || phone, ip, 'success', '短信验证码登录');
        return userInfo;
    }

}
module.exports = new UserService()