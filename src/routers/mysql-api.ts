import express from "express";
import { prisma } from "../lib/prisma";
import { rawQuery } from "../db/raw-query";
import { serializeBigInt } from "../lib/serialize";

const router = express.Router();

router.use(function timeLog(_req, _res, next) {
  console.log("Time: ", new Date());
  next();
});

router.post("/login", async (req, res) => {
  const { name, password } = req.body;
  let message = "登录成功";
  let status = true;
  let resultData: unknown = null;

  try {
    const users = await prisma.user.findMany({ where: { name } });
    if (users.length === 0) {
      message = "账号不存在";
    } else if (password !== users[0].password) {
      message = "密码错误";
    } else {
      resultData = serializeBigInt(users[0]);
    }
  } catch (e) {
    message = "登录失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

router.post("/register", async (req, res) => {
  const nowDate = new Date().getTime();
  let message = "注册成功";
  let status = true;
  let resultData: unknown = null;

  try {
    resultData = await prisma.user.create({
      data: {
        name: req.body.name,
        password: req.body.password,
        phone: req.body.phone,
        createTime: BigInt(nowDate),
        updateTime: BigInt(nowDate),
        level: 1,
      },
    });
    resultData = serializeBigInt(resultData);
  } catch (e) {
    message = "注册失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

router.post("/cancel", async (req, res) => {
  let message = "删除成功";
  let status = true;
  let resultData: unknown = null;

  try {
    await prisma.user.delete({ where: { phone: req.body.phone } });
  } catch (e) {
    message = "删除失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

router.post("/modify", async (req, res) => {
  let message = "修改成功";
  let status = true;
  let resultData: unknown = null;

  try {
    await prisma.user.update({
      where: { phone: req.body.phone },
      data: { password: req.body.pwd },
    });
  } catch (e) {
    message = "修改失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

router.post("/query", async (_req, res) => {
  let message = "查询成功";
  let status = true;
  let resultData: unknown = [];

  try {
    const rows = await prisma.user.findMany({
      select: { id: true, name: true, level: true, phone: true },
    });
    resultData = serializeBigInt(rows);
  } catch (e) {
    message = "查询失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

router.post("/sql", async (req, res) => {
  const sql = req.body.sql as string;
  const values = (req.body.values as unknown[]) || [];
  let message = "执行成功";
  let status = true;
  let resultData: unknown = [];

  try {
    resultData = await rawQuery(sql, values);
  } catch (e) {
    message = "执行失败";
    status = false;
    resultData = e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
});

export default router;
