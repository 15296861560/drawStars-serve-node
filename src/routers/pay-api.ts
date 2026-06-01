import express from "express";
import AlipaySdk from "alipay-sdk";
import AlipayFormData from "alipay-sdk/lib/form";
import { getAppInfo } from "../db/app-info";

const router = express.Router();
let appID = "";
let appCertificate = "";
let alipaySdk: InstanceType<typeof AlipaySdk> | null = null;

getAppInfo("alipay").then((appInfo) => {
  if (appInfo?.app_id && appInfo?.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;
    alipaySdk = new AlipaySdk({
      appId: appID,
      privateKey: appCertificate,
      encryptKey: "",
      gateway: "https://openapi.alipaydev.com/gateway.do",
    });
  }
});

router.use((_req, _res, next) => {
  console.log("Time: ", new Date());
  next();
});

router.post("/toPay", async (req, res) => {
  const goods = req.body.goods;
  const formData = new AlipayFormData();
  formData.setMethod("get");
  formData.addField("notifyUrl", "http://localhost:8081/api/payApi/orderMsg");
  formData.addField("bizContent", {
    outTradeNo: goods.outTradeNo || "out_trade_no",
    productCode: "FAST_INSTANT_TRADE_PAY",
    totalAmount: goods.price * goods.qty,
    subject: goods.subject,
    body: goods.detail,
  });
  const payUrl = await alipaySdk!.exec(
    "alipay.trade.page.pay",
    {},
    { formData: formData as never },
  );
  res.status(200).json({ status: true, data: payUrl });
});

router.post("/orderMsg", async (req, res) => {
  console.log(req);
  res.status(200).json({ status: true, data: req });
});

export default router;
