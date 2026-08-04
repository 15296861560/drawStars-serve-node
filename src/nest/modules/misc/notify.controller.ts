import { Controller, Get, Post, Query, Req } from "@nestjs/common";
import Notify from "../../../public/provider/notify";
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "../../../lib/access-token-service";

@Controller("notifyApi")
export class NotifyController {
  private resolveUserId(
    req: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
    queryUserId?: string,
  ): string | null {
    if (queryUserId) return String(queryUserId);
    if (req.auth?.uid) return String(req.auth.uid);
    const token = getAccessTokenFromRequest(req as never);
    if (token) {
      const info = verifyAccessToken(token);
      if (info && info.uid) return String(info.uid);
    }
    return null;
  }

  @Get("queryNotifyById")
  async queryNotifyById(@Query("notifyId") notifyId: string) {
    try {
      const data = await Notify.queryNotifyById(notifyId);
      return { status: true, msg: "success", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : "queryNotifyById failed",
        data: null,
      };
    }
  }

  @Get("queryNotifyByType")
  async queryNotifyByType(@Query("notifyType") notifyType: string) {
    try {
      const data = await Notify.queryNotifyByType(notifyType);
      return { status: true, msg: "success", data };
    } catch (error) {
      return {
        status: false,
        msg:
          error instanceof Error ? error.message : "queryNotifyByType failed",
        data: null,
      };
    }
  }

  @Get("queryMyNotifyByType")
  async queryMyNotifyByType(
    @Req()
    req: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
    @Query("notifyType") notifyType: string,
    @Query("userId") userId?: string,
  ) {
    try {
      const uid = this.resolveUserId(req, userId);
      if (!uid) {
        return { status: false, msg: "userId is required", data: null };
      }
      const data = await Notify.queryMyNotifyByType(notifyType, uid);
      return { status: true, msg: "success", data };
    } catch (error) {
      return {
        status: false,
        msg:
          error instanceof Error ? error.message : "queryMyNotifyByType failed",
        data: null,
      };
    }
  }

  @Get("queryAllNotify")
  async queryAllNotify() {
    try {
      const data = await Notify.queryAllNotify();
      return { status: true, msg: "success", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : "queryAllNotify failed",
        data: null,
      };
    }
  }

  @Get("queryMyAllNotify")
  async queryMyAllNotify(
    @Req()
    req: {
      headers?: Record<string, unknown>;
      query?: Record<string, unknown>;
      cookies?: Record<string, string>;
      auth?: { uid?: string };
    },
    @Query("userId") userId?: string,
  ) {
    try {
      const uid = this.resolveUserId(req, userId);
      if (!uid) {
        return { status: false, msg: "userId is required", data: null };
      }
      const data = await Notify.queryMyAllNotify(uid);
      return { status: true, msg: "success", data };
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : "queryMyAllNotify failed",
        data: null,
      };
    }
  }

  @Post("sendNotify")
  sendNotify() {
    return { status: true, data: "POST请求返回数据" };
  }
}
