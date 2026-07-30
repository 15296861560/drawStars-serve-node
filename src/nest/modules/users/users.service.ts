import { Injectable } from "@nestjs/common";
import fs from "fs";
import path from "path";
import { PrismaService } from "../../prisma/prisma.service";
import userService from "../../../public/service/userService";
import userRedisClient from "../../../public/db/redis/client";
import config from "../../../config/publish-config";
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../../../lib/access-token-service";

const OAUTH_PLATFORMS = [
  "wechat",
  "wecom",
  "qq",
  "github",
  "google",
  "apple",
] as const;

const ROLE_MAP: Record<
  number,
  { name: string; permissions: string[] }
> = {
  1: {
    name: "普通用户",
    permissions: ["查看个人中心", "编辑个人资料", "接收站内通知"],
  },
  2: {
    name: "进阶用户",
    permissions: [
      "普通用户全部权限",
      "使用高级组件",
      "创建个人资源",
    ],
  },
  9: {
    name: "管理员",
    permissions: ["进阶用户全部权限", "管理系统配置", "查看全部通知"],
  },
  99: {
    name: "超级管理员",
    permissions: ["全部系统权限", "用户管理", "角色管理"],
  },
};

function stripPassword<T extends Record<string, unknown>>(user: T | null) {
  if (!user) return null;
  const { password: _p, ...rest } = user;
  return rest;
}

function isEmail(account: string) {
  return account.includes("@");
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  resolveUserId(
    request: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
    bodyId?: number | string,
  ): number | null {
    if (request.auth?.uid) {
      return Number(request.auth.uid);
    }
    const token = getAccessTokenFromRequest(request as never);
    if (token) {
      const info = verifyAccessToken(token);
      if (info && info.uid) return Number(info.uid);
    }
    if (bodyId !== undefined && bodyId !== null && bodyId !== "") {
      return Number(bodyId);
    }
    return null;
  }

  async assertAccountActive(user: {
    status?: string | null;
    deletedAt?: bigint | number | null;
  }) {
    if (user.deletedAt) {
      throw new Error("账号已注销");
    }
    if (user.status && user.status !== "active") {
      throw new Error("账号已停用");
    }
  }

  async queryUserInfo(id: number) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        name: true,
        introduction: true,
        birthday: true,
        region: true,
        gender: true,
        phone: true,
        email: true,
        accountAlias: true,
        avatar: true,
        level: true,
        status: true,
        smsLoginEnabled: true,
        oauthLoginEnabled: true,
        deletedAt: true,
        createTime: true,
        updateTime: true,
      },
    });
    if (!user) return null;
    return {
      ...user,
      id: Number(user.id),
      createTime: user.createTime ? Number(user.createTime) : null,
      updateTime: user.updateTime ? Number(user.updateTime) : null,
      deletedAt: user.deletedAt ? Number(user.deletedAt) : null,
    };
  }

  async updateUserInfo(
    id: number,
    payload: Partial<{
      name: string;
      introduction: string;
      birthday: string;
      region: string;
      gender: string;
      phone: string | null;
      email: string | null;
      accountAlias: string;
      avatar: string | null;
      password: string;
      status: string;
      smsLoginEnabled: boolean;
      oauthLoginEnabled: boolean;
      deletedAt: bigint | null;
    }>,
  ) {
    const data: Record<string, unknown> = { updateTime: BigInt(Date.now()) };
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        data[key] = value;
      }
    }
    return this.prisma.client.user.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  async changePassword(id: number, password: string, newPassword: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { password: true, status: true, deletedAt: true },
    });
    if (!user) return false;
    await this.assertAccountActive(user);
    if (user.password !== password) {
      return false;
    }
    await this.updateUserInfo(id, { password: newPassword });
    return true;
  }

  async getCaptcha(account: string, type = "login") {
    if (isEmail(account)) {
      const code = String(Math.floor(Math.random() * 8999) + 1000);
      const expireSeconds = 2 * 60;
      const redisKey = `${type}-${account}`;
      if (await userRedisClient.exists(redisKey)) {
        throw new Error("验证码未过期，请稍后重试");
      }
      await userRedisClient.set(redisKey, code);
      await userRedisClient.expire(redisKey, expireSeconds);
      console.log(`[email-captcha] ${account} type=${type} code=${code}`);
      return { ok: true, captcha: code, channel: "email" as const };
    }

    try {
      const ok = await userService.getCaptcha(account, type);
      return { ok: !!ok, captcha: null as string | null, channel: "sms" as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("未过期")) {
        throw new Error(msg);
      }
      // 短信通道失败时写入开发态验证码便于联调
      const code = String(Math.floor(Math.random() * 8999) + 1000);
      const redisKey = `${type}-${account}`;
      if (!(await userRedisClient.exists(redisKey))) {
        await userRedisClient.set(redisKey, code);
        await userRedisClient.expire(redisKey, 120);
      }
      const stored = (await userRedisClient.get(redisKey)) || code;
      console.log(`[sms-captcha-fallback] ${account} type=${type} code=${stored}`);
      return {
        ok: true,
        captcha: String(stored),
        channel: "sms" as const,
        warning: msg,
      };
    }
  }

  async verifyCaptcha(account: string, captcha: string, type = "login") {
    return userService.verifyCaptcha(account, captcha, type);
  }

  private async ensureLoginMethod(id: number, removing: "phone" | "email") {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { phone: true, email: true, password: true },
    });
    if (!user) throw new Error("用户不存在");
    const oauthCount = await this.prisma.client.oauthInfo.count({
      where: { userId: BigInt(id) },
    });
    const hasPhone = !!user.phone && removing !== "phone";
    const hasEmail = !!user.email && removing !== "email";
    const hasPassword = !!user.password;
    if (!hasPhone && !hasEmail && !hasPassword && oauthCount === 0) {
      throw new Error("至少保留一种登录方式");
    }
  }

  async changePhone(
    id: number,
    payload: {
      phone?: string | null;
      oldCaptcha?: string;
      newCaptcha?: string;
      unbind?: boolean;
    },
  ) {
    const user = await this.queryUserInfo(id);
    if (!user) throw new Error("用户不存在");
    await this.assertAccountActive(user);

    if (payload.unbind) {
      if (user.phone && payload.oldCaptcha) {
        const ok = await this.verifyCaptcha(
          user.phone,
          payload.oldCaptcha,
          "unbindPhone",
        );
        if (!ok) throw new Error("验证码错误");
      }
      await this.ensureLoginMethod(id, "phone");
      await this.updateUserInfo(id, { phone: null });
      return true;
    }

    if (!payload.phone) throw new Error("缺少新手机号");

    if (user.phone) {
      if (!payload.oldCaptcha) throw new Error("请先验证原手机号");
      const oldOk = await this.verifyCaptcha(
        user.phone,
        payload.oldCaptcha,
        "changePhone",
      );
      if (!oldOk) throw new Error("原手机号验证码错误");
    }

    if (!payload.newCaptcha) throw new Error("请验证新手机号");
    const newOk = await this.verifyCaptcha(
      payload.phone,
      payload.newCaptcha,
      "bindPhone",
    );
    if (!newOk) throw new Error("新手机号验证码错误");

    const exists = await this.prisma.client.user.findFirst({
      where: { phone: payload.phone, NOT: { id: BigInt(id) } },
    });
    if (exists) throw new Error("该手机号已被占用");

    await this.updateUserInfo(id, { phone: payload.phone });
    return true;
  }

  async changeEmail(
    id: number,
    payload: {
      email?: string | null;
      oldCaptcha?: string;
      newCaptcha?: string;
      unbind?: boolean;
    },
  ) {
    const user = await this.queryUserInfo(id);
    if (!user) throw new Error("用户不存在");
    await this.assertAccountActive(user);

    if (payload.unbind) {
      if (user.email && payload.oldCaptcha) {
        const ok = await this.verifyCaptcha(
          user.email,
          payload.oldCaptcha,
          "unbindEmail",
        );
        if (!ok) throw new Error("验证码错误");
      }
      await this.ensureLoginMethod(id, "email");
      await this.updateUserInfo(id, { email: null });
      return true;
    }

    if (!payload.email) throw new Error("缺少邮箱");

    if (user.email) {
      if (!payload.oldCaptcha) throw new Error("请先验证原邮箱");
      const oldOk = await this.verifyCaptcha(
        user.email,
        payload.oldCaptcha,
        "changeEmail",
      );
      if (!oldOk) throw new Error("原邮箱验证码错误");
    }

    if (!payload.newCaptcha) throw new Error("请验证新邮箱");
    const newOk = await this.verifyCaptcha(
      payload.email,
      payload.newCaptcha,
      "bindEmail",
    );
    if (!newOk) throw new Error("新邮箱验证码错误");

    const exists = await this.prisma.client.user.findFirst({
      where: { email: payload.email, NOT: { id: BigInt(id) } },
    });
    if (exists) throw new Error("该邮箱已被占用");

    await this.updateUserInfo(id, { email: payload.email });
    return true;
  }

  async resetPassword(payload: {
    account: string;
    captcha: string;
    newPassword: string;
  }) {
    const type = "resetPwd";
    const ok = await this.verifyCaptcha(payload.account, payload.captcha, type);
    if (!ok) throw new Error("验证码错误");

    const user = isEmail(payload.account)
      ? await this.prisma.client.user.findFirst({
          where: { email: payload.account },
        })
      : await this.prisma.client.user.findFirst({
          where: { phone: payload.account },
        });
    if (!user) throw new Error("账号不存在");
    await this.assertAccountActive(user);
    await this.updateUserInfo(Number(user.id), {
      password: payload.newPassword,
    });
    return true;
  }

  async updateLoginPrefs(
    id: number,
    prefs: { smsLoginEnabled?: boolean; oauthLoginEnabled?: boolean },
  ) {
    await this.updateUserInfo(id, prefs);
    return true;
  }

  getUploadDir() {
    return config.uploadDir || path.join(process.cwd(), "uploadDir");
  }

  async setAvatar(id: number, avatarUrl: string | null) {
    const user = await this.queryUserInfo(id);
    if (!user) throw new Error("用户不存在");
    if (user.avatar && user.avatar.startsWith("/") && avatarUrl === null) {
      const filename = user.avatar.replace(/^\/+/, "").replace(/^uploadImg\//, "");
      const filePath = path.join(this.getUploadDir(), filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    await this.updateUserInfo(id, { avatar: avatarUrl });
    return avatarUrl;
  }

  async listOauthBinds(id: number) {
    const binds = await this.prisma.client.oauthInfo.findMany({
      where: { userId: BigInt(id) },
    });
    const bound = new Set(binds.map((b) => b.platform));
    return OAUTH_PLATFORMS.map((platform) => ({
      platform,
      bound: bound.has(platform),
      available: platform === "github",
      openId: binds.find((b) => b.platform === platform)?.openId ?? null,
    }));
  }

  async getOauthAuthorizeInfo(platform: string, userId: number) {
    if (platform !== "github") {
      return { available: false, authorizeUrl: null as string | null };
    }
    const githubProvider = (
      await import("../../../public/provider/oauth/githubProvider")
    ).default;
    await githubProvider.init();
    if (!githubProvider.appID) {
      return { available: false, authorizeUrl: null as string | null };
    }
    const redirectUri = encodeURIComponent(
      `http://127.0.0.1:${config.serve_port}/loginApi/oauthLogin/github`,
    );
    const state = encodeURIComponent(`bind_${userId}`);
    const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${githubProvider.appID}&scope=user&state=${state}&redirect_uri=${redirectUri}`;
    return { available: true, authorizeUrl };
  }

  async oauthUnbind(id: number, platform: string) {
    if (platform !== "github") {
      throw new Error("该平台暂不支持解绑");
    }
    await this.ensureLoginMethod(id, "phone");
    // ensureLoginMethod only checks phone/email remove; for oauth unbind check remaining methods
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { phone: true, email: true, password: true },
    });
    if (!user) throw new Error("用户不存在");
    const oauthCount = await this.prisma.client.oauthInfo.count({
      where: { userId: BigInt(id) },
    });
    if (
      !user.phone &&
      !user.email &&
      !user.password &&
      oauthCount <= 1
    ) {
      throw new Error("至少保留一种登录方式");
    }
    await this.prisma.client.oauthInfo.deleteMany({
      where: { userId: BigInt(id), platform },
    });
    return true;
  }

  async bindOauthToUser(
    userId: number,
    platform: string,
    openId: string | number,
  ) {
    const existing = await this.prisma.client.oauthInfo.findFirst({
      where: { openId: String(openId) },
    });
    if (existing && Number(existing.userId) !== userId) {
      throw new Error("该第三方账号已绑定其他用户");
    }
    if (existing && Number(existing.userId) === userId) {
      return true;
    }
    const now = Date.now();
    await this.prisma.client.oauthInfo.create({
      data: {
        platform,
        userId: BigInt(userId),
        openId: String(openId),
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
    });
    return true;
  }

  async getOrCreateNotifyPrefs(id: number) {
    let pref = await this.prisma.client.userNotifyPref.findUnique({
      where: { userId: BigInt(id) },
    });
    if (!pref) {
      pref = await this.prisma.client.userNotifyPref.create({
        data: {
          userId: BigInt(id),
          inApp: true,
          sms: false,
          email: false,
          websocket: true,
          updateTime: BigInt(Date.now()),
        },
      });
    }
    return {
      userId: Number(pref.userId),
      inApp: pref.inApp,
      sms: pref.sms,
      email: pref.email,
      websocket: pref.websocket,
    };
  }

  async updateNotifyPrefs(
    id: number,
    prefs: Partial<{
      inApp: boolean;
      sms: boolean;
      email: boolean;
      websocket: boolean;
    }>,
  ) {
    await this.getOrCreateNotifyPrefs(id);
    const updated = await this.prisma.client.userNotifyPref.update({
      where: { userId: BigInt(id) },
      data: {
        ...prefs,
        updateTime: BigInt(Date.now()),
      },
    });
    return {
      userId: Number(updated.userId),
      inApp: updated.inApp,
      sms: updated.sms,
      email: updated.email,
      websocket: updated.websocket,
    };
  }

  async myRoles(id: number) {
    const user = await this.queryUserInfo(id);
    if (!user) throw new Error("用户不存在");
    const level = user.level ?? 1;
    const role = ROLE_MAP[level] || {
      name: `等级 ${level}`,
      permissions: ["基础访问权限"],
    };
    return {
      level,
      roleName: role.name,
      permissions: role.permissions,
      accountAlias: user.accountAlias,
      status: user.status,
    };
  }

  async deactivateAccount(id: number, password: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { password: true, status: true, deletedAt: true },
    });
    if (!user) throw new Error("用户不存在");
    if (user.deletedAt) throw new Error("账号已注销");
    if (user.password !== password) throw new Error("密码错误");
    await this.updateUserInfo(id, { status: "deactivated" });
    return true;
  }

  async deleteAccount(id: number, password: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { password: true, deletedAt: true },
    });
    if (!user) throw new Error("用户不存在");
    if (user.deletedAt) throw new Error("账号已注销");
    if (user.password !== password) throw new Error("密码错误");
    await this.updateUserInfo(id, {
      status: "deleted",
      deletedAt: BigInt(Date.now()),
      phone: null,
      email: null,
    });
    await this.prisma.client.oauthInfo.deleteMany({
      where: { userId: BigInt(id) },
    });
    return true;
  }

  sanitizeUser(user: Record<string, unknown> | null) {
    return stripPassword(user);
  }
}
