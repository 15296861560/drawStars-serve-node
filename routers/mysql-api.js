const express = require('express')
const router = express.Router()
const db = require('../public/db/mysql/base')

// 该路由使用的中间件
/*router.use(function timeLog(req, res, next) {
  console.log('Time: ', new Date());
  next();
});*/

// 登录接口，并且验证密码--查询方法的使用案例
router.post('/login', function (req, res) {
  let name = req.body.name;
  let password = req.body.password;

  db.selectData('select * from user where name = ' + name, (e, r) => {
    let message = '登录成功',
      status = true,
      resultData = r;

    if (r.length == 0) {
      message = "账号不存在";
    } else if (password != r[0].password) {
      message = "密码错误";
    } else {
      resultData = r[0];
    }
    if (e) {
      message = "登录失败"
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
});
// 注册接口 增加的方法使用案例
router.post('/register', (req, res) => {
  let nowDate = new Date().getTime();
  let saveData = {
    "name": req.body.name,
    "password": req.body.password,
    "phone": req.body.phone,
    "createTime": nowDate,
    "updateTime": nowDate,
    "level": 1,
  };
  db.insertData('user', saveData, (e, r) => {
    let message = '注册成功',
      status = true,
      resultData = r;
    if (e) {
      message = "注册失败"
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
})
// 注销接口 删除的方法使用案例
router.post('/cancel', (req, res) => {
  let data = {
    phone: req.body.phone
  }
  db.deleteData('user', data, (e, r) => {
    let message = '删除成功',
      status = true,
      resultData = null;
    if (e) {
      message = "删除失败"
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  });

})
// 修改密码接口 修改的方法使用案例
router.post('/modify', (req, res) => {
  let _where = {
    phone: req.body.phone
  };
  let _set = {
    password: req.body.pwd
  };

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
})

router.post('/query', function (req, res) {
  db.selectData('select id,name,level,phone from user', (e, r) => {
    let message = '查询成功',
      status = true,
      resultData = r;
    if (e) {
      message = "查询失败"
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
});

router.post('/sql', function (req, res) {
  let sql = req.body.sql;

  db.selectData(sql, (e, r) => {
    let message = '执行成功',
      status = true,
      resultData = r;
    if (e) {
      message = "执行失败";
      status = false;
      resultData = e;
    }
    res.status(200).json({
      "status": status,
      "msg": message,
      "data": resultData
    });
  })
});
module.exports = router;
