const express = require('express')
const router = express.Router()
const db = require('../public/db/mysql/base')

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('req.hostname  : ', req.hostname);
  console.log('req.originalUrl : ', req.originalUrl);
  console.log('Time: ', new Date());
  next();
});

router.get('/getPovinceList', function (req, res) {
  let values = ['0']
  db.selectData("select * from province where city=?", values, (e, r) => {
    let resultData = r;
    if (e) {
      resultData = e;
    }
    res.send(resultData);

  })
});
router.get('/getCityList', function (req, res) {
  let province = req.query.province;
  let values = [province, '0', '0']
  db.selectData(`select * from province where province=? and area=? and city!=?`, values, (e, r) => {
    let resultData = r;
    if (e) {
      resultData = e;
    }
    res.send(resultData);

  })
});
router.get('/getAreaList', function (req, res) {
  const {
    province,
    city
  } = req.query;
  let values = [province, city, '0', '0']
  db.selectData("select * from province where province=? and city=? and town=? and area!=?", values, (e, r) => {
    let resultData = r;
    if (e) {
      resultData = e;
    }
    res.send(resultData);

  })
});
router.get('/getTownList', function (req, res) {
  const {
    province,
    city,
    area
  } = req.query;
  let values = [province, city, area, '0']
  db.selectData("select * from province where province=? and city=? and area=? and  town!=?", values, (e, r) => {
    let resultData = r;
    if (e) {
      resultData = e;
    }
    res.send(resultData);

  })
});

module.exports = router;