/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-24 23:40:49
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-10-06 21:55:18
 */
const userService = require('../public/service/userService.js');
const githubProvider = require('../public/provider/oauth/githubProvider.js');
const express = require('express')
const router = express.Router()

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('req.hostname  : ', req.hostname);
  console.log('req.originalUrl : ', req.originalUrl);
  console.log('Time: ', new Date());
  
  // 存储用户代理信息到全局变量，以便在userService中使用
  global.userAgent = req.headers['user-agent'] || '';
  
  next();
});

// 登录接口
router.post('/loginByPassword', async function (req, res) {
  const phone = req.body.phone;
  const password = req.body.password;
  // 获取客户端IP地址
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  let message,
    status,
    resultData;

  try {
    let userInfo = await userService.loginByPassword(phone, password, ip);
    message = '登录成功'
    status = true;
    resultData = userInfo;

  } catch (e) {
    message = e
    status = false;
    resultData = e;
  }
  res.status(200).json({
    "status": status,
    "msg": message,
    "data": resultData
  });

});

router.post('/loginBySMS', async function (req, res) {
  const phone = req.body.phone;
  const captcha = req.body.captcha;
  // 获取客户端IP地址
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  let message,
    status,
    resultData;

  try {
    let userInfo = await userService.smsLogin(phone, captcha, ip);
    message = '登录成功'
    status = true;
    resultData = userInfo;

  } catch (e) {
    message = e
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
  let saveData = {
    "name": req.body.name,
    "password": req.body.password,
    "phone": req.body.phone,
    "createTime": nowDate,
    "updateTime": nowDate,
    "level": 1,
  };
  let resultData = saveData;

  let message = '注册成功',
    status = true;
  try {
    const userId = await userService.registerByPhone(saveData);
    saveData.id = userId;
    userService.setToken(saveData);

  } catch (e) {
    status = false;
    message = `注册失败:${e?.toString()}`;
    resultData = e;
  }

  res.status(200).json({
    "status": status,
    "msg": message,
    "data": resultData
  });
})

// 查询自己的用户信息
router.get('/verifyLogin', async (req, res) => {
  let message = 'ok',
    status = true,
    resultData = null;
  try {
    let token = req.headers.accessToken;
    if (!token && req.query.accessToken) {
      token = decodeURIComponent(req.query.accessToken);
    }

    if (!token) {
      // 获取原始Cookie字符串（如果有的话）
      const cookies = req.headers.cookie;

      // 解析Cookie字符串为对象
      const parsedCookies = cookies ? cookies.split('; ').reduce((acc, cookie) => {
        const [key, value] = cookie.split('=');
        return {
          ...acc,
          [key]: value
        };
      }, {}) : {};

      token = parsedCookies?.accessToken;
      if (!token) {
        throw ("fail")
      }
    }
    resultData = await userService.verifyLogin(token);
  } catch (e) {
    status = false;
    message = "fail";
    resultData = e;
  }

  res.send({
    "status": status,
    "msg": message,
    "data": resultData
  });
})


// 第三方自动登录
router.get('/oauthLogin/github', async (req, res) => {
  const {
    code,
    state
  } = req.query;

  let message = '注册成功',
    status = true,
    resultData = {};
  try {

    const accessToken = await githubProvider.getAccessToken(code, state);
    const githubUserInfo = await githubProvider.queryGithubUserInfo(accessToken);

    let oauthInfo = await userService.queryByOauth(githubUserInfo.id);
    const nowDate = new Date().getTime();
    resultData = {
      name: githubUserInfo.login,
      phone: githubUserInfo.login,
      createTime: nowDate,
      updateTime: nowDate,
      level: 1,
      avatar: githubUserInfo.avatar_url
    };
    if (!oauthInfo) {
      oauthInfo = await userService.registerByOauth(resultData, "github", githubUserInfo.id);
    } else {
      oauthInfo.userId = oauthInfo.user_id;
    }

    resultData.id = oauthInfo.userId;

    userService.setToken(resultData);

    // 记录GitHub第三方登录日志
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await userService.recordLoginLog(resultData.name, ip, 'success', 'GitHub第三方登录');

  } catch (e) {
    status = false;
    message = `登录失败:${e?.toString()}`;
    resultData = e;
    return;
  }

  const returnUrl = `${req.headers.referer}login?accessToken=${encodeURIComponent(resultData.token)}`;

  req.headers.accessToken = resultData.token;
  res.redirect(returnUrl);

})

// 获取验证码
router.get('/getCaptcha', async (req, res) => {
  let message = 'ok',
    status = true,
    resultData = null;

  const {
    type,
    account
  } = req.query;

  try {
    status = await userService.getCaptcha(account, type);
  } catch (e) {
    message = e;
  }


  res.send({
    "status": status,
    "msg": message,
    "data": resultData
  });
})

module.exports = router;