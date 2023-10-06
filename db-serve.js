/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:06:25
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-09 23:23:26
 */
const express = require('express')
const config = require('./config/publish-config')
const port = config['serve_port'] //发布端口

require('./public/utils/axios/axios-config.js');
require('./public/ws/wsServer')
require('./public/ws/notifyServer')
require('./config/redis-config.js');

const server = express()
// 我的基础路由文件.
const mysqlApi = require('./routers/mysql-api')
const testApi = require('./routers/test-api')
const controller = require('./routers/controller')
const agoraApi = require('./routers/agora-api')
const translateApi = require('./routers/translate-api')
const payApi = require('./routers/pay-api')
const resourceApi = require('./routers/resource-api')
const profileApi = require('./routers/profile-api')
const loginApi = require('./routers/login-api')
const notifyApi = require('./routers/notify-api')
const baiduApi = require('./routers/baidu-api')
const tokenVerify = require('./public/provider/tokenVerify').tokenVerify





// json 解析 
server.use(express.json());
server.use(express.urlencoded({
  extended: false
}));

//设置跨域访问
server.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type,Content-Length, Authorization, Accept,X-Requested-With");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", ' 3.2.1')
  next();
});
// 暴露公共资源
server.use(express.static('public'))
server.use(tokenVerify)
server.use('/mysqlApi', mysqlApi)
server.use('/testApi', testApi)
server.use('/controller', controller)
server.use('/agoraApi', agoraApi)
server.use('/translateApi', translateApi)
server.use('/payApi', payApi)
server.use('/resourceApi', resourceApi)
server.use('/profileApi', profileApi)
server.use('/loginApi', loginApi)
server.use('/notifyApi', notifyApi)
server.use('/baiduApi', baiduApi)


server.listen(port)

console.log(`server run port ${port}`)