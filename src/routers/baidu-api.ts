import express from "express";
import { getAppInfo } from "../db/app-info";

const router = express.Router();
const appName = "baidu_map";

router.use((_req, _res, next) => {
  console.log("Time: ", new Date());
  next();
});

router.get("/getMapApiKey", async (_req, res) => {
  const appInfo = await getAppInfo(appName);
  res.send({
    status: true,
    msg: "success",
    data: appInfo?.app_certificate,
  });
});

export default router;
