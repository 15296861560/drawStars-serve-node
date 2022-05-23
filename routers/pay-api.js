const express = require('express')
const router = express.Router()
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const {
  getAppInfo
} = require('../public/db/mysql/commom-api')

let appID = "";
let appCertificate = "";
let alipaySdk = null;
const appName = 'alipay';

getAppInfo(appName).then(appInfo => {
  if (appInfo && appInfo.app_id && appInfo.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;

    // 普通公钥模式
    alipaySdk = new AlipaySdk({
      // 参考下方 SDK 配置
      appId: appID,
      privateKey: appCertificate,
      //可设置AES密钥，调用AES加解密相关接口时需要（可选）
      encryptKey: '',
      // 沙箱网关
      gateway: "https://openapi.alipaydev.com/gateway.do"
    });
  }
});




// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('Time: ', new Date());
  next();
});


router.post('/toPay', async function (req, res) {
  const goods = req.body.goods;

  const formData = new AlipayFormData();
  // 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
  formData.setMethod('get');

  formData.addField('notifyUrl', 'http://localhost:8081/api/payApi/orderMsg');
  formData.addField('bizContent', {
    outTradeNo: goods.outTradeNo || 'out_trade_no',
    productCode: 'FAST_INSTANT_TRADE_PAY',
    totalAmount: goods.price * goods.qty,
    subject: goods.subject,
    body: goods.detail,
  });
  const payUrl = await alipaySdk.exec(
    'alipay.trade.page.pay', {}, {
      formData: formData
    },
  );
  res.status(200).json({
    "status": true,
    "data": payUrl
  });
});

router.post('/orderMsg', async function (req, res) {
  console.log(req);

  res.status(200).json({
    "status": true,
    "data": req
  });
});

module.exports = router;
