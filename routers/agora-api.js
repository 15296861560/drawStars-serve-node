const express = require('express')
const router = express.Router()
const {
  getAppInfo
} = require('../public/db/mysql/commom-api')

const AccessToken = require("../public/agora/AccessToken").AccessToken
const Priviledges = require('../public/agora/AccessToken').priviledges

const RtmRole = {
  Rtm_User: 1
}
const RtcRole = {
  // DEPRECATED. Role::ATTENDEE has the same privileges as Role.PUBLISHER.
  ATTENDEE: 0,

  // RECOMMENDED. Use this role for a voice/video call or a live broadcast, if your scenario does not require authentication for [Hosting-in](https://docs.agora.io/en/Agora%20Platform/terms?platform=All%20Platforms#hosting-in).
  PUBLISHER: 1,

  /* Only use this role if your scenario require authentication for [Hosting-in](https://docs.agora.io/en/Agora%20Platform/terms?platform=All%20Platforms#hosting-in).
   * @note In order for this role to take effect, please contact our support team to enable authentication for Hosting-in for you. Otherwise, Role.SUBSCRIBER still has the same privileges as Role.PUBLISHER.
   */
  SUBSCRIBER: 2,

  // DEPRECATED. Role.ADMIN has the same privileges as Role.PUBLISHER.
  ADMIN: 101
}
class RtmTokenBuilder {

  /**
   * @param {*} appID: The App ID issued to you by Agora. Apply for a new App ID from 
   *       Agora Dashboard if it is missing from your kit. See Get an App ID.
   * @param {*} appCertificate:	Certificate of the application that you registered in 
   *                 the Agora Dashboard. See Get an App Certificate.
   * @param {*} account: The user account. 
   * @param {*} role : Role_Publisher = 1: A broadcaster (host) in a live-broadcast profile.
   *      Role_Subscriber = 2: (Default) A audience in a live-broadcast profile.
   * @param {*} privilegeExpiredTs : represented by the number of seconds elapsed since 
   *                   1/1/1970. If, for example, you want to access the
   *                   Agora Service within 10 minutes after the token is 
   *                   generated, set expireTimestamp as the current 
   * @return token
   */
  static buildToken(appID, appCertificate, account, role, privilegeExpiredTs) {
    const key = new AccessToken(appID, appCertificate, account, "")
    key.addPriviledge(Priviledges.kRtmLogin, privilegeExpiredTs)
    return key.build()
  }
}

class RtcTokenBuilder {

  /**
   * Builds an RTC token using an Integer uid.
   * @param {*} appID  The App ID issued to you by Agora.
   * @param {*} appCertificate Certificate of the application that you registered in the Agora Dashboard.
   * @param {*} channelName The unique channel name for the AgoraRTC session in the string format. The string length must be less than 64 bytes. Supported character scopes are:
   * - The 26 lowercase English letters: a to z.
   * - The 26 uppercase English letters: A to Z.
   * - The 10 digits: 0 to 9.
   * - The space.
   * - "!", "#", "$", "%", "&", "(", ")", "+", "-", ":", ";", "<", "=", ".", ">", "?", "@", "[", "]", "^", "_", " {", "}", "|", "~", ",".
   * @param {*} uid User ID. A 32-bit unsigned integer with a value ranging from 1 to (2^32-1).
   * @param {*} role See #userRole.
   * - Role.PUBLISHER; RECOMMENDED. Use this role for a voice/video call or a live broadcast.
   * - Role.SUBSCRIBER: ONLY use this role if your live-broadcast scenario requires authentication for [Hosting-in](https://docs.agora.io/en/Agora%20Platform/terms?platform=All%20Platforms#hosting-in). In order for this role to take effect, please contact our support team to enable authentication for Hosting-in for you. Otherwise, Role_Subscriber still has the same privileges as Role_Publisher.
   * @param {*} privilegeExpiredTs  represented by the number of seconds elapsed since 1/1/1970. If, for example, you want to access the Agora Service within 10 minutes after the token is generated, set expireTimestamp as the current timestamp + 600 (seconds).
   * @return The new Token.
   */
  static buildTokenWithUid(appID, appCertificate, channelName, uid, role, privilegeExpiredTs) {
    return this.buildTokenWithAccount(appID, appCertificate, channelName, uid, role, privilegeExpiredTs)
  }

  /**
   * Builds an RTC token using an Integer uid.
   * @param {*} appID  The App ID issued to you by Agora.
   * @param {*} appCertificate Certificate of the application that you registered in the Agora Dashboard.
   * @param {*} channelName The unique channel name for the AgoraRTC session in the string format. The string length must be less than 64 bytes. Supported character scopes are:
   * - The 26 lowercase English letters: a to z.
   * - The 26 uppercase English letters: A to Z.
   * - The 10 digits: 0 to 9.
   * - The space.
   * - "!", "#", "$", "%", "&", "(", ")", "+", "-", ":", ";", "<", "=", ".", ">", "?", "@", "[", "]", "^", "_", " {", "}", "|", "~", ",".
   * @param {*} account The user account.
   * @param {*} role See #userRole.
   * - Role.PUBLISHER; RECOMMENDED. Use this role for a voice/video call or a live broadcast.
   * - Role.SUBSCRIBER: ONLY use this role if your live-broadcast scenario requires authentication for [Hosting-in](https://docs.agora.io/en/Agora%20Platform/terms?platform=All%20Platforms#hosting-in). In order for this role to take effect, please contact our support team to enable authentication for Hosting-in for you. Otherwise, Role_Subscriber still has the same privileges as Role_Publisher.
   * @param {*} privilegeExpiredTs  represented by the number of seconds elapsed since 1/1/1970. If, for example, you want to access the Agora Service within 10 minutes after the token is generated, set expireTimestamp as the current timestamp + 600 (seconds).
   * @return The new Token.
   */
  static buildTokenWithAccount(appID, appCertificate, channelName, account, role, privilegeExpiredTs) {
    this.key = new AccessToken(appID, appCertificate, channelName, account)
    this.key.addPriviledge(Priviledges.kJoinChannel, privilegeExpiredTs)
    if (role == RtcRole.ATTENDEE ||
      role == RtcRole.PUBLISHER ||
      role == RtcRole.ADMIN) {
      this.key.addPriviledge(Priviledges.kPublishAudioStream, privilegeExpiredTs)
      this.key.addPriviledge(Priviledges.kPublishVideoStream, privilegeExpiredTs)
      this.key.addPriviledge(Priviledges.kPublishDataStream, privilegeExpiredTs)
    }
    return this.key.build();
  }
}

let appID = "";
let appCertificate = "";

// 获取声网账户信息
const appName = 'agora';

getAppInfo(appName).then(appInfo => {
  if (appInfo && appInfo.app_id && appInfo.app_certificate) {
    appID = appInfo.app_id;
    appCertificate = appInfo.app_certificate;
  }
});

const expirationTimeInSeconds = 60 * 60 * 24;
const currentTimestamp = Math.floor(Date.now() / 1000);

const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds


// 该路由使用的中间件
router.use(function timeLog(req, res, next) {
  console.log('agora-api Time: ', new Date());
  next();
});

// 测试用路由接口
router.get('/getTest', function (req, res) {
  res.send('GET请求返回数据');
});

router.get('/getAppID', function (req, res) {
  const result = {
    "status": true,
    "msg": 'success',
    "data": appID
  }
  res.send(result);
});


router.post('/getRTMToken', function (req, res) {
  const account = req.body.account;
  const token = RtmTokenBuilder.buildToken(appID, appCertificate, account, RtmRole, privilegeExpiredTs);
  res.status(200).json({
    "status": true,
    "data": token
  });
});


router.post('/getRTCToken', function (req, res) {
  const uidOrAccount = req.body.user;

  const channelName = req.body.channelName;
  const role = RtcRole[req.body.role] || 0;

  const token = RtcTokenBuilder.buildTokenWithUid(appID, appCertificate, channelName, uidOrAccount, role, privilegeExpiredTs);;
  res.status(200).json({
    "status": true,
    "data": token
  });
});

module.exports = router;