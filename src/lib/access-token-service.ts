import { getAppInfo } from "../db/app-info";
import { AccessToken } from "../public/provider/tokenBuild";
import type { Request } from "express";

const APP_NAME = "draw_stars";

export interface TokenPayload {
  appID?: string;
  uid?: string;
  expireTimestamp?: number;
  [key: string]: unknown;
}

let appID = "";
let appCertificate = "";
let tokenBuilder: AccessToken | null = null;
let initPromise: Promise<void> | null = null;

export async function initAccessTokenService(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const appInfo = await getAppInfo(APP_NAME);
    if (appInfo?.app_id && appInfo?.app_certificate) {
      appID = appInfo.app_id;
      appCertificate = appInfo.app_certificate;
      tokenBuilder = new AccessToken(appID, appCertificate);
      console.log("[token] AccessToken service ready");
    } else {
      console.warn(
        "[token] app_info 中无 draw_stars 配置，token 加解密与校验不可用",
      );
    }
  })();
  return initPromise;
}

export function getAccessTokenFromRequest(req: Request): string | undefined {
  const headers = req.headers;
  const fromHeader =
    (headers.accesstoken as string | undefined) ||
    (headers["access-token"] as string | undefined);
  if (fromHeader) return fromHeader;

  const auth = headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return undefined;
}

export function verifyAccessToken(
  token: string,
): false | TokenPayload {
  if (!tokenBuilder || !appID) return false;
  try {
    const tokenInfo = JSON.parse(
      tokenBuilder.decryption(token) || "{}",
    ) as TokenPayload;
    if (tokenInfo.appID !== appID) return false;
    if (
      tokenInfo.expireTimestamp &&
      tokenInfo.expireTimestamp < Date.now()
    ) {
      return false;
    }
    return tokenInfo;
  } catch (e) {
    console.log("[token] verify failed:", e);
    return false;
  }
}

export function buildUserToken(uid: string | number): string | undefined {
  if (!tokenBuilder) return undefined;
  try {
    return tokenBuilder.build(uid);
  } catch (e) {
    console.error("[token] buildUserToken failed:", e);
    return undefined;
  }
}

export function getTokenBuilder() {
  return tokenBuilder;
}

export function isTokenServiceReady() {
  return !!tokenBuilder && !!appID;
}
