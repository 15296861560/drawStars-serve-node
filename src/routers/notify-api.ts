import express from "express";
import Notify from "../public/provider/notify";

const router = express.Router();

router.use((_req, _res, next) => {
  console.log("Time: ", new Date());
  next();
});

router.get("/queryNotifyById", async (req, res) => {
  const resultData = await Notify.queryNotifyById(req.query.notifyId as string);
  res.send({ status: true, msg: "success", data: resultData });
});

router.get("/queryNotifyByType", async (req, res) => {
  const resultData = await Notify.queryNotifyByType(
    req.query.notifyType as string,
  );
  res.send({ status: true, msg: "success", data: resultData });
});

router.get("/queryMyNotifyByType", async (req, res) => {
  const resultData = await Notify.queryMyNotifyByType(
    req.query.notifyType as string,
    req.query.userId as string,
  );
  res.send({ status: true, msg: "success", data: resultData });
});

router.get("/queryAllNotify", async (_req, res) => {
  const resultData = await Notify.queryAllNotify();
  res.send({ status: true, msg: "success", data: resultData });
});

router.get("/queryMyAllNotify", async (req, res) => {
  const resultData = await Notify.queryMyAllNotify(req.query.userId as string);
  res.send({ status: true, msg: "success", data: resultData });
});

router.post("/sendNotify", (_req, res) => {
  res.status(200).json({ status: true, data: "POST请求返回数据" });
});

export default router;
