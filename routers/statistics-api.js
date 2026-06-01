const umamiService = require('../public/service/umamiService.js');
const express = require('express')
const router = express.Router()


router.get('/getPageviewStats', async (req, res) => {
    let message = 'ok',
        status = true,
        resultData = null;

    try {
        resultData = await umamiService.getPageviewStats(req.query);
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