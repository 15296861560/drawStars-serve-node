const express = require('express')
const router = express.Router()
const {
    getAppInfo
} = require('../public/db/mysql/commom-api')

const appName = 'baidu_map';

// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
    console.log('Time: ', new Date());
    next();
});

// 获取百度地图的密钥
router.get('/getMapApiKey', async function (req, res) {
    const appInfo = await getAppInfo(appName);

    const result = {
        "status": true,
        "msg": 'success',
        "data": appInfo?.app_certificate
    }
    res.send(result);
});

module.exports = router;