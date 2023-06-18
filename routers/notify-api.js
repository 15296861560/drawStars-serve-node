/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-04-09 22:26:18
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-16 19:03:54
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\routers\notify-api.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
const express = require('express')
const router = express.Router()
const Notify = require("../public/provider/notify")

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('Time: ', new Date());
  next();
});

router.get('/queryNotifyById', async function (req, res) {
  let notifyId = req.body.notifyId;
  let resultData = await Notify.queryNotifyById(notifyId);

  let result = {
    "status": true,
    "msg": 'success',
    "data": resultData
  }
  res.send(result);
});
router.get('/queryNotifyByType', async function (req, res) {

  let notifyType = req.body.notifyType;
  let resultData = await Notify.queryNotifyByType(notifyType);

  let result = {
    "status": true,
    "msg": 'success',
    "data": resultData
  }
  res.send(result);
});
router.get('/queryMyNotifyByType', async function (req, res) {
  let notifyType = req.body.notifyType;
  let userId = req.body.userId;
  let resultData = await Notify.queryMyNotifyByType(notifyType, userId);

  let result = {
    "status": true,
    "msg": 'success',
    "data": resultData
  }
  res.send(result);
});
router.get('/queryAllNotify', async function (req, res) {

  let resultData = await Notify.queryAllNotify();

  let result = {
    "status": true,
    "msg": 'success',
    "data": resultData
  }
  res.send(result);
});
router.get('/queryMyAllNotify', async function (req, res) {
  let userId = req.body.userId;
  let resultData = await Notify.queryMyAllNotify(userId);

  let result = {
    "status": true,
    "msg": 'success',
    "data": resultData
  }
  res.send(result);
});


router.post('/sendNotify', function (req, res) {
  res.status(200).json({
    "status": true,
    "data": 'POST请求返回数据'
  });
});

module.exports = router;