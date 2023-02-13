/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:08:51
 * @LastEditors: lgy
 * @LastEditTime: 2023-02-13 22:31:21
 */
const Log = require("../../provider/log.js")


class RedisCilent {
    getClient() {
        return redisClient;
    }

    addLog(method, key, res) {
        let type = Log.LOG_TYPE.REDIS;
        let hostname = type;
        let originalUrl = type;
        let content = {
            key: key,
            res: res,
            methods: method
        };
        Log.addLog(type, hostname, originalUrl, content);
    }

    async set(key, val) {
        let res = await redisClient.set(key, val); //成功为OK
        this.addLog('set', key, res)
        return res;
    }

    async get(key) {
        let value = await redisClient.get(key); // 得到value 没有则为null
        this.addLog('get', key, value);
        return value;
    }

    async del(key) {
        let value = await redisClient.del(key); // 0 没有key关键字 // 1删除成功
        this.addLog('del', key, value)
        return value;
    }

    async quit() {
        let res = await redisClient.quit(key, val); // 关闭连接
        this.addLog('quit', 'quit', res)
        return res;
    }

    async disconnect() {
        let res = await redisClient.disconnect(key, val); // 关闭连接
        this.addLog('disconnect', 'disconnect', res)
        return res;
    }
}

module.exports = new RedisCilent()