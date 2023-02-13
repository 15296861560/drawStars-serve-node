/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:06:25
 * @LastEditors: lgy
 * @LastEditTime: 2023-02-13 22:30:03
 */
const express = require('express')
const port = 8010 //发布端口
// const port = 8011; //本地测试端口


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
const tokenVerify = require('./public/provider/tokenVerify')


require('./public/ws/wsServer')
require('./config/redis-config.js');


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


server.listen(port)

console.log(`server run port ${port}`)