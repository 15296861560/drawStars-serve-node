import express from "express";
import { getAppInfo } from "../db/app-info";

// Legacy Agora token builder (CommonJS)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AccessToken, priviledges: Priviledges } = require("../../public/agora/AccessToken");

const RtmRole = { Rtm_User: 1 };
const RtcRole = {
  ATTENDEE: 0,
  PUBLISHER: 1,
  SUBSCRIBER: 2,
  ADMIN: 101,
};

class RtmTokenBuilder {
  static buildToken(
    appID: string,
    appCertificate: string,
    account: string,
    _role: unknown,
    privilegeExpiredTs: number,
  ) {
    const key = new AccessToken(appID, appCertificate, account, "");
    key.addPriviledge(Priviledges.kRtmLogin, privilegeExpiredTs);
    return key.build();
  }
}

class RtcTokenBuilder {
  static key: InstanceType<typeof AccessToken>;

  static buildTokenWithUid(
    appID: string,
    appCertificate: string,
    channelName: string,
    uid: string | number,
    role: number,
    privilegeExpiredTs: number,
  ) {
    return this.buildTokenWithAccount(
      appID,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs,
    );
  }

  static buildTokenWithAccount(
    appID: string,
    appCertificate: string,
    channelName: string,
    account: string | number,
    role: number,
    privilegeExpiredTs: number,
  ) {
    this.key = new AccessToken(appID, appCertificate, channelName, account);
    this.key.addPriviledge(Priviledges.kJoinChannel, privilegeExpiredTs);
    if (
      role === RtcRole.ATTENDEE ||
      role === RtcRole.PUBLISHER ||
      role === RtcRole.ADMIN
    ) {
      this.key.addPriviledge(Priviledges.kPublishAudioStream, privilegeExpiredTs);
      this.key.addPriviledge(Priviledges.kPublishVideoStream, privilegeExpiredTs);
      this.key.addPriviledge(Priviledges.kPublishDataStream, privilegeExpiredTs);
    }
    return this.key.build();
  }
}

const router = express.Router();
let appID = "";
let appCertificate = "";

getAppInfo("agora").then((appInfo) => {
  if (appInfo?.app_id && appInfo?.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;
  }
});

const expirationTimeInSeconds = 60 * 60 * 24;
const currentTimestamp = Math.floor(Date.now() / 1000);
const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

router.use((_req, _res, next) => {
  console.log("agora-api Time: ", new Date());
  next();
});

router.get("/getTest", (_req, res) => {
  res.send("GET请求返回数据");
});

router.get("/getAppID", (_req, res) => {
  res.send({ status: true, msg: "success", data: appID });
});

router.post("/getRTMToken", (req, res) => {
  const account = req.body.account;
  const token = RtmTokenBuilder.buildToken(
    appID,
    appCertificate,
    account,
    RtmRole,
    privilegeExpiredTs,
  );
  res.status(200).json({ status: true, data: token });
});

router.post("/getRTCToken", (req, res) => {
  const uidOrAccount = req.body.user;
  const channelName = req.body.channelName;
  const role = RtcRole[req.body.role as keyof typeof RtcRole] ?? 0;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appID,
    appCertificate,
    channelName,
    uidOrAccount,
    role,
    privilegeExpiredTs,
  );
  res.status(200).json({ status: true, data: token });
});

export default router;
