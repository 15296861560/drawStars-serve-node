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
const appApi = require('./routers/app-api')
const logApi = require('./routers/log-api')
const tokenVerify = require('./public/provider/tokenVerify').tokenVerify
const Log = require('./public/provider/log')





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
server.use(express.static('uploadDir'))
server.use(tokenVerify)
// 添加操作日志中间件，自动记录所有API请求
server.use(Log.operationLogMiddleware())

// 配置所有API路由
server.use('/mysqlApi', mysqlApi)
server.use('/testApi', testApi)
server.use('/controller', controller)
server.use('/agoraApi', agoraApi)
server.use('/translateApi', translateApi)

// 为支付API配置特定的操作类型
const payRouter = express.Router()
payRouter.use(Log.operationLogMiddleware({ operation: Log.OPERATION_TYPE.UPDATE }))
payRouter.use('/', payApi)
server.use('/payApi', payRouter)

// 为资源API配置特定的操作类型
const resourceRouter = express.Router()
resourceRouter.use(Log.operationLogMiddleware({ operation: Log.OPERATION_TYPE.SELECT }))
resourceRouter.use('/', resourceApi)
server.use('/resourceApi', resourceRouter)

server.use('/profileApi', profileApi)

// 为登录API配置特定的操作类型
const loginRouter = express.Router()
loginRouter.use(Log.operationLogMiddleware({ operation: 'auth' }))
loginRouter.use('/', loginApi)
server.use('/loginApi', loginRouter)

server.use('/notifyApi', notifyApi)
server.use('/baiduApi', baiduApi)
server.use('/appApi', appApi)
server.use('/logApi', logApi)


server.listen(port)

// 全局未捕获异常处理
process.on('uncaughtException', function (err) {
  console.log('uncaughtException', typeof err === 'string' ? err : JSON.stringify(err));
  
  // 记录为业务日志
  try {
    Log.addBusinessLog(
      '系统', 
      Log.BUSINESS_LOG_TYPE.ERROR, 
      '未捕获全局异常', 
      { 
        error: typeof err === 'string' ? err : JSON.stringify(err),
        time: new Date().toISOString() 
      }, 
      'system'
    );
  } catch (logError) {
    console.error('记录异常日志失败:', logError);
  }
});

// 为Express添加全局错误处理中间件
server.use((err, req, res, next) => {
  console.error('Express全局错误:', err);
  
  // 记录为业务日志
  try {
    Log.addBusinessLog(
      '系统', 
      Log.BUSINESS_LOG_TYPE.ERROR, 
      'Express请求处理异常', 
      { 
        error: err.message || JSON.stringify(err),
        stack: err.stack,
        path: req.path,
        method: req.method,
        time: new Date().toISOString()
      }, 
      req.user?.username || 'system'
    );
  } catch (logError) {
    console.error('记录异常日志失败:', logError);
  }
  
  // 返回错误响应
  res.status(500).json({
    status: false,
    msg: '服务器内部错误',
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

console.log(`server run port ${port}`)