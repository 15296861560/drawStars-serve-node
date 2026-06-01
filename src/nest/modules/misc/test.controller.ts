import { Controller, Get, Post } from "@nestjs/common";

@Controller("testApi")
export class TestController {
  @Get("test/getTest")
  getTest() {
    return "GET请求返回数据";
  }

  @Post("test/postTest")
  postTest() {
    return { status: true, data: "POST请求返回数据" };
  }
}
