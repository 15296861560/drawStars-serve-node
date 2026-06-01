import "./env";

import express, { type ErrorRequestHandler } from "express";
import config from "./config/publish-config";
import { initAccessTokenService } from "./lib/access-token-service";

import "./public/utils/axios/axios-config";
import "./public/ws/wsServer";
import "./public/ws/notifyServer";
import "./config/redis-config";

import mysqlApi from "./routers/mysql-api";
import testApi from "./routers/test-api";
import controller from "./routers/controller";
import agoraApi from "./routers/agora-api";
import translateApi from "./routers/translate-api";
import payApi from "./routers/pay-api";
import resourceApi from "./routers/resource-api";
import profileApi from "./routers/profile-api";
import loginApi from "./routers/login-api";
import notifyApi from "./routers/notify-api";
import baiduApi from "./routers/baidu-api";
import statisticsApi from "./routers/statistics-api";
import { tokenVerify } from "./public/provider/tokenVerify";

const port = config.serve_port;
const server = express();

server.use(express.json());
server.use(express.urlencoded({ extended: false }));

server.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,Content-Length, Authorization, Accept, X-Requested-With, accessToken, accesstoken",
  );
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", " 3.2.1");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/** 兼容 Vite 代理保留 /api 前缀的请求 */
function mountApiRoutes(
  app: express.Application,
  basePath: string,
  router: express.Router,
) {
  app.use(basePath, router);
  if (!basePath.startsWith("/api")) {
    app.use(`/api${basePath}`, router);
  }
}

server.use(express.static("uploadDir"));
server.use(tokenVerify);

mountApiRoutes(server, "/mysqlApi", mysqlApi);
mountApiRoutes(server, "/testApi", testApi);
mountApiRoutes(server, "/controller", controller);
mountApiRoutes(server, "/agoraApi", agoraApi);
mountApiRoutes(server, "/translateApi", translateApi);
mountApiRoutes(server, "/payApi", payApi);
mountApiRoutes(server, "/resourceApi", resourceApi);
mountApiRoutes(server, "/profileApi", profileApi);
mountApiRoutes(server, "/loginApi", loginApi);
mountApiRoutes(server, "/notifyApi", notifyApi);
mountApiRoutes(server, "/baiduApi", baiduApi);
mountApiRoutes(server, "/statisticsApi", statisticsApi);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[server] unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({
      status: false,
      msg: err?.message || "服务器内部错误",
      code: "INTERNAL_ERROR",
      data: null,
    });
  }
};

server.use((_req, res) => {
  res.status(404).json({
    status: false,
    msg: "接口不存在",
    code: "NOT_FOUND",
    data: null,
  });
});

server.use(errorHandler);

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});

async function start() {
  await initAccessTokenService();
  server.listen(port);
  console.log(`server run port ${port}`);
}

start().catch((e) => {
  console.error("server failed to start:", e);
  process.exit(1);
});
