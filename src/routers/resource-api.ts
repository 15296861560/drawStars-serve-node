import express from "express";
import { prisma } from "../lib/prisma";
import { serializeBigInt } from "../lib/serialize";

const router = express.Router();

router.use(function timeLog(req, _res, next) {
  console.log("req.hostname  : ", req.hostname);
  console.log("req.originalUrl : ", req.originalUrl);
  console.log("Time: ", new Date());
  next();
});

router.get("/getPovinceList", async (_req, res) => {
  try {
    const rows = await prisma.province.findMany({ where: { city: "0" } });
    res.send(serializeBigInt(rows));
  } catch (e) {
    res.send(e);
  }
});

router.get("/getCityList", async (req, res) => {
  const province = req.query.province as string;
  try {
    const rows = await prisma.province.findMany({
      where: { province, area: "0", NOT: { city: "0" } },
    });
    res.send(serializeBigInt(rows));
  } catch (e) {
    res.send(e);
  }
});

router.get("/getAreaList", async (req, res) => {
  const { province, city } = req.query;
  try {
    const rows = await prisma.province.findMany({
      where: {
        province: province as string,
        city: city as string,
        town: "0",
        NOT: { area: "0" },
      },
    });
    res.send(serializeBigInt(rows));
  } catch (e) {
    res.send(e);
  }
});

router.get("/getTownList", async (req, res) => {
  const { province, city, area } = req.query;
  try {
    const rows = await prisma.province.findMany({
      where: {
        province: province as string,
        city: city as string,
        area: area as string,
        NOT: { town: "0" },
      },
    });
    res.send(serializeBigInt(rows));
  } catch (e) {
    res.send(e);
  }
});

export default router;
