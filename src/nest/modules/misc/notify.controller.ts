import { Controller, Get, Post, Query } from "@nestjs/common";
import Notify from "../../../public/provider/notify";

@Controller("notifyApi")
export class NotifyController {
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
    @Query("notifyType") notifyType: string,
    @Query("userId") userId: string,
  ) {
    try {
      const data = await Notify.queryMyNotifyByType(notifyType, userId);
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
  async queryMyAllNotify(@Query("userId") userId: string) {
    try {
      const data = await Notify.queryMyAllNotify(userId);
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
