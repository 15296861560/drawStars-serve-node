import express from "express";
import { getAppInfo } from "../db/app-info";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MD5 } = require("../../public/baidu/md5");

const router = express.Router();
let appID = "";
let appCertificate = "";

getAppInfo("baidu_translate").then((appInfo) => {
  if (appInfo?.app_id && appInfo?.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;
  }
});

router.use((_req, _res, next) => {
  console.log("Time: ", new Date());
  next();
});

router.post("/getSign", async (req, res) => {
  const contents = req.body.contents;
  const salt = req.body.salt;
  const str = appID + contents + salt + appCertificate;
  const sign = MD5(str);

  res.status(200).json({
    status: true,
    data: { appID, sign },
  });
});

export default router;
