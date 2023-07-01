/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-24 23:40:49
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-02 01:55:17
 */
const userService = require('../public/service/userService.js');
const express = require('express')
const router = express.Router()

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('req.hostname  : ', req.hostname);
  console.log('req.originalUrl : ', req.originalUrl);
  console.log('Time: ', new Date());
  next();
});

// 登录接口，并且验证密码
router.post('/loginByPassword', async function (req, res) {
  const phone = req.body.phone;
  const password = req.body.password;

  let message,
    status,
    resultData;

  try {
    let userInfo = await userService.loginByPassword(phone, password);
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
    await userService.registerByPhone(saveData);
    userService.setToken(resultData, req);

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

module.exports = router;