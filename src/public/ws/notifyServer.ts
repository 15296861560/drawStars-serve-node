import notifyServer from "drawstarts-notify-serve";
import config from "../../config/publish-config";
import Log from "../provider/log";
import Notify from "../provider/notify";
import { verifyToken as verifyAccessToken } from "../provider/tokenVerify";

const port = config.notify_port;

/** 仅当值为可解析的整型用户 ID 时落库（频道名 / all / server 不写入 notify 表） */
function isPersistableUserId(value: unknown): value is string | number {
  if (value === undefined || value === null || value === "") return false;
  const s = String(value);
  if (s === "server" || s === "all") return false;
  return /^\d+$/.test(s);
}

function verifyToken(token: string) {
  const info = verifyAccessToken(token);
  if (!info) {
    throw new Error("token verify failed");
  }
  const userId = info.userId ?? info.uid;
  if (userId == null || userId === "") {
    throw new Error("userId missing from token");
  }
  return {
    ...info,
    userId: String(userId),
    uid: String(userId),
    expireTime:
      typeof info.expireTimestamp === "number"
        ? info.expireTimestamp
        : undefined,
  };
}

async function persistNotify(
  sendId: string,
  receiveId: string,
  notifyType: string,
  notifyMsg: string,
  _messageId?: string,
) {
  // 0.2.0 频道/全体推送时 receiveId 为 channelName 或 "all"；宿主 DB 仅存用户单播
  if (!isPersistableUserId(receiveId)) {
    return undefined;
  }
  const send = isPersistableUserId(sendId) ? sendId : "0";
  return Notify.addNotify(send, receiveId, notifyType, notifyMsg);
}

notifyServer.init({
  config: {
    port,
    // HTTP 管理面默认关闭，避免与业务端口冲突；需要时设 NOTIFY_HTTP_PORT
    httpPort: Number(process.env.NOTIFY_HTTP_PORT || 0) || 0,
    enableOffline: process.env.NOTIFY_ENABLE_OFFLINE !== "false",
    adminToken: process.env.NOTIFY_ADMIN_TOKEN || "",
  },
  verifyToken,
  addLog: (type, hostname, originalUrl, content) =>
    Log.addLog(type, hostname, originalUrl, content),
  addNotify: persistNotify,
});
