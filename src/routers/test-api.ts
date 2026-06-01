import express from "express";

const router = express.Router();

router.use((_req, _res, next) => {
  console.log("Time: ", new Date());
  next();
});

router.get("/test/getTest", (_req, res) => {
  res.send("GET请求返回数据");
});

router.post("/test/postTest", (_req, res) => {
  res.status(200).json({ status: true, data: "POST请求返回数据" });
});

export default router;
