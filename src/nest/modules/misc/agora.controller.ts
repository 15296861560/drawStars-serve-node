import { Body, Controller, Get, Post } from "@nestjs/common";
import { getAppInfo } from "../../../db/app-info";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AccessToken, priviledges: Priviledges } = require("../../../../public/agora/AccessToken");

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
    privilegeExpiredTs: number,
  ) {
    const key = new AccessToken(appID, appCertificate, account, "");
    key.addPriviledge(Priviledges.kRtmLogin, privilegeExpiredTs);
    return key.build();
  }
}

class RtcTokenBuilder {
  static buildTokenWithUid(
    appID: string,
    appCertificate: string,
    channelName: string,
    uid: string | number,
    role: number,
    privilegeExpiredTs: number,
  ) {
    const key = new AccessToken(appID, appCertificate, channelName, uid);
    key.addPriviledge(Priviledges.kJoinChannel, privilegeExpiredTs);
    if (
      role === RtcRole.ATTENDEE ||
      role === RtcRole.PUBLISHER ||
      role === RtcRole.ADMIN
    ) {
      key.addPriviledge(Priviledges.kPublishAudioStream, privilegeExpiredTs);
      key.addPriviledge(Priviledges.kPublishVideoStream, privilegeExpiredTs);
      key.addPriviledge(Priviledges.kPublishDataStream, privilegeExpiredTs);
    }
    return key.build();
  }
}

@Controller("agoraApi")
export class AgoraController {
  @Get("getTest")
  getTest() {
    return "GET请求返回数据";
  }

  @Get("getAppID")
  async getAppID() {
    const appInfo = await getAppInfo("agora");
    return { status: true, msg: "success", data: appInfo?.app_id || "" };
  }

  @Post("getRTMToken")
  async getRTMToken(@Body() body: { account: string }) {
    const appInfo = await getAppInfo("agora");
    const appID = appInfo?.app_id || "";
    const appCertificate = appInfo?.app_certificate || "";
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const token = RtmTokenBuilder.buildToken(
      appID,
      appCertificate,
      body.account,
      privilegeExpiredTs,
    );
    return { status: true, data: token };
  }

  @Post("getRTCToken")
  async getRTCToken(
    @Body() body: { user: string; channelName: string; role?: keyof typeof RtcRole },
  ) {
    const appInfo = await getAppInfo("agora");
    const appID = appInfo?.app_id || "";
    const appCertificate = appInfo?.app_certificate || "";
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const role = body.role ? RtcRole[body.role] ?? 0 : 0;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      body.channelName,
      body.user,
      role,
      privilegeExpiredTs,
    );
    return { status: true, data: token };
  }
}
