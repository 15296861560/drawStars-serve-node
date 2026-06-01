import express from "express";
import umamiService from "../public/service/umamiService";

const router = express.Router();

router.get("/getPageviewStats", async (req, res) => {
  let message: unknown = "ok";
  let status = true;
  let resultData: unknown = null;

  try {
    resultData = await umamiService.getPageviewStats(
      req.query as unknown as Parameters<
        typeof umamiService.getPageviewStats
      >[0],
    );
  } catch (e) {
    message = e;
    status = false;
  }

  res.send({ status, msg: message, data: resultData });
});

export default router;
