const express = require('express')
const router = express.Router()
const {
  getAppInfo
} = require('../public/db/mysql/commom-api')
const {
  MD5
} = require('../public/baidu/md5')


let appID = "";
let appCertificate = "";

// 获取百度翻译账户信息
const appName = 'baidu_translate';

getAppInfo(appName).then(appInfo => {
  if (appInfo && appInfo.app_id && appInfo.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;
  }
});


// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('Time: ', new Date());
  next();
});

router.post('/getSign', async function (req, res) {
  const contents = req.body.contents;
  const salt = req.body.salt;

  // 拼接字符串
  const str = appID + contents + salt + appCertificate;
  // 计算签名
  const sign = MD5(str);

  let data = {
    appID: appID,
    sign: sign
  };

  res.status(200).json({
    "status": true,
    "data": data
  });
});

module.exports = router;
