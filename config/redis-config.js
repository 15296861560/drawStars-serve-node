const redis = require('redis')
const port = 6379;
const ip = '127.0.0.1';
const Log = require("../public/provider/log.js")

// 连接
const redisClient = redis.createClient({
    url: `redis://${ip}:${port}`
    /* 
     * redis://[[username][:password]@][host][:port][/db-number]
     * 写密码redis://:123456@127.0.0.1:6379/0 
     * 写用户redis://uername@127.0.0.1:6379/0  
     * 或者不写密码 redis://127.0.0.1:6379/0
     * 或者不写db_number redis://:127.0.0.1:6379
     * */
});

redisClient.on('ready', () => {
    let type = Log.LOG_TYPE.REDIS;
    let hostname = type;
    let originalUrl = type;
    let content = {
        methods: 'ready'
    };
    Log.addLog(type, hostname, originalUrl, content);
})

redisClient.on('error', err => {
    let type = Log.LOG_TYPE.REDIS;
    let hostname = type;
    let originalUrl = type;
    let content = {
        err,
        methods: 'error'
    };
    Log.addLog(type, hostname, originalUrl, content);
})

redisClient.connect()
global.redisClient = redisClient;


module.exports = redisClient;