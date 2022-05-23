const express = require('express')
const router = express.Router()

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('Time: ', new Date());
  next();
});

// 测试用路由接口
router.get('/test/getTest', function (req, res) {
  res.send('GET请求返回数据');
});

router.post('/test/postTest', function (req, res) {
  res.status(200).json({
    "status": true,
    "data": 'POST请求返回数据'
  });
});

module.exports = router;
