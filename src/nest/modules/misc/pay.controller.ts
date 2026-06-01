import { Body, Controller, Post } from "@nestjs/common";
import AlipaySdk from "alipay-sdk";
import AlipayFormData from "alipay-sdk/lib/form";
import { getAppInfo } from "../../../db/app-info";

@Controller("payApi")
export class PayController {
  @Post("toPay")
  async toPay(
    @Body()
    body: {
      goods: {
        outTradeNo?: string;
        price: number;
        qty: number;
        subject: string;
        detail: string;
      };
    },
  ) {
    const appInfo = await getAppInfo("alipay");
    const appId = appInfo?.app_id || "";
    const privateKey = appInfo?.app_certificate || "";

    const sdk = new AlipaySdk({
      appId,
      privateKey,
      encryptKey: "",
      gateway: "https://openapi.alipaydev.com/gateway.do",
    });

    const goods = body.goods;
    const formData = new AlipayFormData();
    formData.setMethod("get");
    formData.addField("notifyUrl", "http://localhost:8081/api/payApi/orderMsg");
    formData.addField("bizContent", {
      outTradeNo: goods.outTradeNo || "out_trade_no",
      productCode: "FAST_INSTANT_TRADE_PAY",
      totalAmount: goods.price * goods.qty,
      subject: goods.subject,
      body: goods.detail,
    });
    const payUrl = await sdk.exec("alipay.trade.page.pay", {}, {
      formData: formData as never,
    });
    return { status: true, data: payUrl };
  }

  @Post("orderMsg")
  orderMsg(@Body() body: unknown) {
    return { status: true, data: body };
  }
}
