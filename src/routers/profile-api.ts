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

router.get("/queryUserInfo", async (req, res) => {
  const id = req.query.id as string | undefined;
  if (!id) {
    res.status(200).json({
      status: false,
      msg: "缺少用户 id",
      data: null,
    });
    return;
  }

  try {
    const rows = await prisma.user.findMany({
      where: { id: BigInt(id) },
      select: {
        name: true,
        introduction: true,
        birthday: true,
        region: true,
        gender: true,
        phone: true,
      },
    });

    const data = rows.length ? serializeBigInt(rows[0]) : null;
    res.status(200).json({
      status: true,
      msg: "ok",
      data,
    });
  } catch (e) {
    console.error("[profileApi] queryUserInfo:", e);
    res.status(200).json({
      status: false,
      msg: e instanceof Error ? e.message : "查询失败",
      data: null,
    });
  }
});

async function updateUserInfo(
  res: express.Response,
  _set: Record<string, unknown>,
  _where: { id: number | string },
) {
  let message = "修改成功";
  let status = true;
  let resultData: unknown = null;

  try {
    await prisma.user.update({
      where: { id: BigInt(_where.id) },
      data: {
        ..._set,
        updateTime: BigInt(new Date().getTime()),
      } as Parameters<typeof prisma.user.update>[0]["data"],
    });
  } catch (e) {
    message = "修改失败";
    status = false;
    resultData = e instanceof Error ? e.message : e;
  }

  res.status(200).json({ status, msg: message, data: resultData });
}

router.post("/updateUserInfo", (req, res) => {
  const _where = { id: req.body.id };
  const { name, introduction, birthday, region, gender } = req.body;
  updateUserInfo(res, { name, introduction, birthday, region, gender }, _where);
});

router.post("/changePassword", async (req, res) => {
  const password = req.body.password as string;
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.body.id) },
      select: { password: true },
    });
    if (!user || user.password !== password) {
      res.status(200).json({
        status: false,
        msg: "校验失败",
        data: "密码错误",
      });
      return;
    }
    updateUserInfo(
      res,
      { password: req.body.newPassword },
      { id: req.body.id },
    );
  } catch (e) {
    res.status(200).json({
      status: false,
      msg: "校验失败",
      data: e instanceof Error ? e.message : e,
    });
  }
});

router.post("/changePhone", (req, res) => {
  updateUserInfo(res, { phone: req.body.phone }, { id: req.body.id });
});

export default router;
