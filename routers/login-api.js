/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-24 23:40:49
 * @LastEditors: lgy
 * @LastEditTime: 2022-11-09 23:18:49
 */
const express = require('express')
const router = express.Router()
const db = require('../public/db/mysql/base')
const AccessToken = require("../public/provider/tokenBuild").AccessToken
const {
  getAppInfo
} = require('../public/db/mysql/commom-api')


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

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('req.hostname  : ', req.hostname);
  console.log('req.originalUrl : ', req.originalUrl);
  console.log('Time: ', new Date());
  next();
});

// 生成并设置token
let setToken = function (userInfo, req) {
  let token = Token.build(userInfo.id)
  userInfo.token = token;
}

let verifyToken = function (token) {
  try {
    let tokenInfo = Token.decryption(token);
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

function queryUserByPhone(phone) {
  return new Promise((resolve, reject) => {
    let values = [phone];
    db.selectData('select * from user where phone = ?', values, (e, r) => {
      e && reject(e)

      if (r.length !== 0) {
        resolve(r[0]);
      } else {
        resolve(null);
      }
    })
  })
}

// 登录接口，并且验证密码
router.post('/loginByPassword', async function (req, res) {
  let phone = req.body.phone;
  let password = req.body.password;

  let message,
    status,
    resultData;

  try {
    let userInfo = await queryUserByPhone(phone);
    if (!userInfo) {
      message = "账号不存在";
    } else if (password !== userInfo.password) {
      message = "密码错误";
    } else {
      message = '登录成功'
      status = true;
      resultData = userInfo;
      setToken(resultData, req);
    }

  } catch (e) {
    message = "登录失败"
    status = false;
    resultData = e;
  }
  res.status(200).json({
    "status": status,
    "msg": message,
    "data": resultData
  });

});
// 注册接口
router.post('/registerByPhone', async (req, res) => {
  let nowDate = new Date().getTime();
  let phone = req.body.phone;
  let saveData = {
    "name": req.body.name,
    "password": req.body.password,
    "phone": phone,
    "createTime": nowDate,
    "updateTime": nowDate,
    "level": 1,
  };

  let message = '注册成功',
    status = true;
  try {
    let hasUser = await queryUserByPhone(phone);
    if (hasUser) {
      message = "注册失败,该手机号已注册";
      res.status(200).json({
        "status": false,
        "msg": message,
        "data": null
      });
      return;
    }

  } catch (e) {
    res.status(200).json({
      "status": false,
      "msg": e,
      "data": null
    });
    return;
  }



  db.insertData('user', saveData, async (e, r) => {
    let userInfo = await queryUserByPhone(phone);
    resultData = userInfo;
    if (e) {
      message = "注册失败"
      status = false;
      resultData = e;
    } else {
      setToken(resultData, req);
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
})

module.exports = router;