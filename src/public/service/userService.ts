import { prisma } from "../../lib/prisma";
import { serializeBigInt } from "../../lib/serialize";
import {
  buildUserToken,
  initAccessTokenService,
  verifyAccessToken,
} from "../../lib/access-token-service";
import Log from "../provider/log";
import zhenzismsClient from "../provider/sms/zhenzismsProvider";
import userRedisClient from "../db/redis/client";

const USER_TABLE_NAME = "user";
const OAUTH_TABLE_NAME = "oauth_info";
const BACKEND = "backend";
const DEFAULT_PASSWORD = "@drawStars123";

export type UserRecord = Record<string, unknown> & {
  id?: number | bigint;
  name?: string | null;
  password?: string | null;
  phone?: string | null;
  token?: string;
};

class UserService {
  constructor() {
    void initAccessTokenService();
  }

  async queryUserByCondition(
    condition: string,
    value: string | number,
  ): Promise<UserRecord | null> {
    let table = USER_TABLE_NAME;
    let field = condition;
    if (condition === "oauth") {
      table = OAUTH_TABLE_NAME;
      field = "open_id";
    }

    try {
      if (table === OAUTH_TABLE_NAME) {
        const row = await prisma.oauthInfo.findFirst({
          where: { openId: String(value) },
        });
        Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
          method: "queryUserByCondition",
          condition,
          value,
          username:
            (row as { name?: string } | null)?.name ||
            (condition === "name" || condition === "phone" ? String(value) : ""),
          result: true,
        });
        return row ? serializeBigInt(row) : null;
      }

      const where =
        field === "id"
          ? { id: BigInt(value) }
          : field === "phone"
            ? { phone: String(value) }
            : field === "name"
              ? { name: String(value) }
              : { [field]: value };

      const row = await prisma.user.findFirst({
        where: where as { id?: bigint; phone?: string; name?: string },
      });

      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "queryUserByCondition",
        condition,
        value,
        username:
          row?.name ||
          (condition === "name" || condition === "phone" ? String(value) : ""),
        result: true,
      });

      return row ? serializeBigInt(row) : null;
    } catch (e) {
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "queryUserByCondition",
        condition,
        value,
        username:
          condition === "name" || condition === "phone" ? String(value) : "",
        result: e,
      });
      throw e;
    }
  }

  async queryUserById(id: string | number) {
    return this.queryUserByCondition("id", id);
  }

  async queryUserByPhone(phone: string) {
    return this.queryUserByCondition("phone", phone);
  }

  async createUser(userInfo: Record<string, unknown>) {
    if (!userInfo.password) {
      userInfo.password = DEFAULT_PASSWORD;
    }

    try {
      const data = {
        name: userInfo.name as string | undefined,
        password: userInfo.password as string | undefined,
        phone: userInfo.phone as string | undefined,
        email: userInfo.email as string | undefined,
        createTime: userInfo.createTime
          ? BigInt(userInfo.createTime as number)
          : undefined,
        updateTime: userInfo.updateTime
          ? BigInt(userInfo.updateTime as number)
          : undefined,
        level: userInfo.level as number | undefined,
        avatar: userInfo.avatar as string | undefined,
        gender: userInfo.gender as string | undefined,
        introduction: userInfo.introduction as string | undefined,
        birthday: userInfo.birthday as string | undefined,
        region: userInfo.region as string | undefined,
        status: (userInfo.status as string | undefined) || "active",
        smsLoginEnabled:
          userInfo.smsLoginEnabled === undefined
            ? true
            : Boolean(userInfo.smsLoginEnabled),
        oauthLoginEnabled:
          userInfo.oauthLoginEnabled === undefined
            ? true
            : Boolean(userInfo.oauthLoginEnabled),
      };

      const result = await prisma.user.create({ data });
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "createUser",
        username: String(userInfo.name || userInfo.phone || ""),
        userInfo: { ...userInfo, password: "***" },
        result: true,
      });
      return serializeBigInt(result);
    } catch (e) {
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "createUser",
        username: String(userInfo.name || userInfo.phone || ""),
        userInfo: { ...userInfo, password: "***" },
        result: e,
      });
      throw e;
    }
  }

  setToken(userInfo: UserRecord) {
    const token = buildUserToken(userInfo.id as number);
    if (token) userInfo.token = token;
  }

  async loginByPassword(phone: string, password: string) {
    const userInfo = await this.queryUserByPhone(phone);

    if (!userInfo) {
      throw "账号不存在";
    }
    if (userInfo.deletedAt) {
      throw "账号已注销";
    }
    if (userInfo.status && userInfo.status !== "active") {
      throw "账号已停用";
    }
    if (password !== userInfo.password) {
      throw "密码错误";
    }

    this.setToken(userInfo);
    delete userInfo.password;
    return userInfo;
  }

  async registerByCondition(
    condition: string,
    saveData: Record<string, unknown>,
    value: string | number,
  ) {
    const userInfo = await this.queryUserByCondition(condition, value);
    if (userInfo) {
      throw `用户${userInfo.name}已注册`;
    }

    return this.createUser(saveData);
  }

  async registerByPhone(saveData: Record<string, unknown>) {
    await this.registerByCondition("phone", saveData, saveData.phone as string);
    const latest = await prisma.user.findFirst({
      where: { phone: saveData.phone as string },
      orderBy: { id: "desc" },
    });
    return latest ? Number(latest.id) : 0;
  }

  async createOauthUser(oauthInfo: Record<string, unknown> = {}) {
    const nowDate = new Date().getTime();
    oauthInfo.create_time = nowDate;
    oauthInfo.update_time = nowDate;

    try {
      const result = await prisma.oauthInfo.create({
        data: {
          platform: oauthInfo.platform as string,
          userId: BigInt(oauthInfo.user_id as number),
          openId: oauthInfo.open_id as string,
          createTime: BigInt(nowDate),
          updateTime: BigInt(nowDate),
        },
      });
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "createOauthUser",
        oauthInfo,
        result: true,
      });
      return serializeBigInt(result);
    } catch (e) {
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "createOauthUser",
        oauthInfo,
        result: e,
      });
      throw e;
    }
  }

  async queryByOauth(thirdPartyId: string | number) {
    return this.queryUserByCondition("oauth", thirdPartyId);
  }

  async registerByOauth(
    saveData: Record<string, unknown>,
    platform: string,
    thirdPartyId: string | number,
  ) {
    let userId = "";
    try {
      const existing = await this.queryByOauth(thirdPartyId);
      if (existing) {
        throw `用户已注册`;
      }
      const user = await this.createUser(saveData);
      userId = String((user as { id: bigint }).id);
      await this.createOauthUser({
        platform,
        user_id: userId,
        open_id: thirdPartyId,
      });
    } catch (e) {
      Log.addLog(Log.LOG_TYPE.OPERATE, BACKEND, BACKEND, {
        method: "registerByOauth",
        result: e,
      });
      return false;
    }

    return { userId };
  }

  async verifyLogin(token: string) {
    const tokenInfo = verifyAccessToken(token);
    if (!tokenInfo || !tokenInfo.uid) return false;

    const userInfo = await this.queryUserById(tokenInfo.uid);
    if (!userInfo) return false;
    if (userInfo.deletedAt) return false;
    if (userInfo.status && userInfo.status !== "active") return false;
    delete userInfo.password;
    return userInfo;
  }

  async getCaptcha(phone: string, type = "login") {
    try {
      const code = String(Math.floor(Math.random() * 8999) + 1000);
      const expireMins = 2;
      const expireSeconds = expireMins * 60;
      const redisKey = `${type}-${phone}`;
      if (await userRedisClient.exists(redisKey)) {
        throw "验证码未过期，请稍后重试";
      }
      await userRedisClient.set(redisKey, code);
      await userRedisClient.expire(redisKey, expireSeconds);
      const params = {
        number: phone,
        templateParams: [code, `${expireMins}分钟`],
      };
      const res = await zhenzismsClient.send(params);
      if (res.code === 0) {
        return true;
      }
      throw res.data;
    } catch (e) {
      Log.addLog(Log.LOG_TYPE.API, BACKEND, BACKEND, {
        method: "getCaptcha",
        result: e,
      });
      throw e;
    }
  }

  async verifyCaptcha(phone: string, captcha: string, type = "login") {
    const redisKey = `${type}-${phone}`;
    const code = await userRedisClient.get(redisKey);
    return captcha == code;
  }

  async smsLogin(phone: string, captcha: string) {
    if (!(await this.verifyCaptcha(phone, captcha))) {
      throw "验证码错误";
    }
    const userInfo = await this.queryUserByPhone(phone);

    if (!userInfo) {
      throw "账号不存在";
    }
    if (userInfo.deletedAt) {
      throw "账号已注销";
    }
    if (userInfo.status && userInfo.status !== "active") {
      throw "账号已停用";
    }
    if (userInfo.smsLoginEnabled === false) {
      throw "未开启短信一键登录";
    }

    this.setToken(userInfo);
    delete userInfo.password;
    return userInfo;
  }

  async queryUserByEmail(email: string) {
    try {
      const row = await prisma.user.findFirst({ where: { email } });
      return row ? serializeBigInt(row) : null;
    } catch (e) {
      throw e;
    }
  }
}

export default new UserService();
