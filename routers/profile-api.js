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


router.get('/queryUserInfo', function (req, res) {
  const {
    id
  } = req.query;
  let values = [id]

  db.selectData("SELECT name,introduction,birthday,region,gender,phone FROM user WHERE id=?", values, (e, r) => {

    let resultData = r;
    if (e) {
      resultData = e;
    }
    res.send(...resultData);

  })
});

function updateUserInfo(res, _set, _where) {
  _set.updateTime = new Date().getTime();
  db.updateData('user', _set, _where, (e, r) => {
    let message = '修改成功',
      status = true,
      resultData = null;
    if (e) {
      message = "修改失败"
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
}
// 更新信息
router.post('/updateUserInfo', (req, res) => {
  let _where = {
    id: req.body.id
  };

  let {
    name,
    introduction,
    birthday,
    region,
    gender
  } = req.body;
  let _set = {
    name,
    introduction,
    birthday,
    region,
    gender
  };

  updateUserInfo(res, _set, _where)
})

// 修改密码接口
router.post('/changePassword', (req, res) => {
  let password = req.body.password;

  db.selectData("SELECT password FROM user WHERE id=?", [req.body.id], (e, r) => {
    let sqlPassword = r;

    if (e || sqlPassword !== password) {
      res.status(200).json({
        "status": false,
        "msg": "校验失败",
        "data": e || '密码错误'
      });
    } else {
      let _where = {
        id: req.body.id
      };
      let _set = {
        password: req.body.newPassword
      };

      updateUserInfo(res, _set, _where)
    }
  })


})

// 更换手机号
router.post('/changePhone', (req, res) => {
  let _where = {
    id: req.body.id
  };
  let _set = {
    phone: req.body.phone
  };

  updateUserInfo(res, _set, _where)
})

module.exports = router;