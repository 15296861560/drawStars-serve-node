import express from "express";
import userService from "../public/service/userService";
import githubProvider from "../public/provider/oauth/githubProvider";
import { asyncHandler } from "../lib/async-handler";
import { normalizeErrorMessage, sendJson } from "../lib/api-response";

const router = express.Router();

router.use(function timeLog(req, _res, next) {
  console.log("req.hostname  : ", req.hostname);
  console.log("req.originalUrl : ", req.originalUrl);
  console.log("Time: ", new Date());
  next();
});

router.post(
  "/loginByPassword",
  asyncHandler(async (req, res) => {
    const { phone, password } = req.body;
    try {
      const userInfo = await userService.loginByPassword(phone, password);
      sendJson(res, {
        status: true,
        msg: "登录成功",
        data: userInfo,
      });
    } catch (e) {
      sendJson(res, {
        status: false,
        msg: normalizeErrorMessage(e),
        data: null,
      });
    }
  }),
);

router.post(
  "/loginBySMS",
  asyncHandler(async (req, res) => {
    const { phone, captcha } = req.body;
    try {
      const userInfo = await userService.smsLogin(phone, captcha);
      sendJson(res, {
        status: true,
        msg: "登录成功",
        data: userInfo,
      });
    } catch (e) {
      sendJson(res, {
        status: false,
        msg: normalizeErrorMessage(e),
        data: null,
      });
    }
  }),
);

router.post(
  "/registerByPhone",
  asyncHandler(async (req, res) => {
    const nowDate = new Date().getTime();
    const saveData: Record<string, unknown> = {
      name: req.body.name,
      password: req.body.password,
      phone: req.body.phone,
      createTime: nowDate,
      updateTime: nowDate,
      level: 1,
    };

    try {
      const userId = await userService.registerByPhone(saveData);
      saveData.id = userId;
      userService.setToken(saveData);
      sendJson(res, {
        status: true,
        msg: "注册成功",
        data: saveData,
      });
    } catch (e) {
      sendJson(res, {
        status: false,
        msg: `注册失败:${normalizeErrorMessage(e)}`,
        data: null,
      });
    }
  }),
);

router.get(
  "/verifyLogin",
  asyncHandler(async (req, res) => {
    try {
      let token = req.headers.accessToken as string | undefined;
      if (!token && req.query.accessToken) {
        token = decodeURIComponent(req.query.accessToken as string);
      }

      if (!token) {
        const cookies = req.headers.cookie;
        const parsedCookies = cookies
          ? cookies.split("; ").reduce(
              (acc, cookie) => {
                const [key, value] = cookie.split("=");
                return { ...acc, [key]: value };
              },
              {} as Record<string, string>,
            )
          : {};
        token = parsedCookies?.accessToken;
        if (!token) {
          throw new Error("fail");
        }
      }
      const resultData = await userService.verifyLogin(token);
      sendJson(res, { status: true, msg: "ok", data: resultData });
    } catch (e) {
      sendJson(res, {
        status: false,
        msg: "fail",
        data: null,
      });
    }
  }),
);

router.get(
  "/oauthLogin/github",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    let resultData: Record<string, unknown> = {};

    try {
      const accessToken = await githubProvider.getAccessToken(
        code as string,
        state as string,
      );
      const githubUserInfo =
        await githubProvider.queryGithubUserInfo(accessToken);

      let oauthInfo = await userService.queryByOauth(githubUserInfo.id);
      const nowDate = new Date().getTime();
      resultData = {
        name: githubUserInfo.login,
        phone: githubUserInfo.login,
        createTime: nowDate,
        updateTime: nowDate,
        level: 1,
        avatar: githubUserInfo.avatar_url,
      };

      if (!oauthInfo) {
        const registered = await userService.registerByOauth(
          resultData,
          "github",
          githubUserInfo.id,
        );
        if (!registered) {
          throw new Error("oauth注册失败");
        }
        resultData.id = registered.userId;
      } else {
        resultData.id = (oauthInfo as { user_id: number }).user_id;
      }

      userService.setToken(resultData);
    } catch (e) {
      res.redirect(`${req.headers.referer}login?error=1`);
      return;
    }

    const returnUrl = `${req.headers.referer}login?accessToken=${encodeURIComponent(resultData.token as string)}`;
    res.redirect(returnUrl);
  }),
);

router.get(
  "/getCaptcha",
  asyncHandler(async (req, res) => {
    const { type, account } = req.query;
    try {
      const ok = await userService.getCaptcha(account as string, type as string);
      sendJson(res, { status: !!ok, msg: "ok", data: null });
    } catch (e) {
      sendJson(res, {
        status: false,
        msg: normalizeErrorMessage(e),
        data: null,
      });
    }
  }),
);

export default router;
