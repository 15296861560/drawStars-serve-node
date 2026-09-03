import { Controller, Get, Query, Req } from "@nestjs/common";
import { ImRecommendService } from "./im-recommend.service";

@Controller("im/hall")
export class ImHallController {
  constructor(private readonly recommend: ImRecommendService) {}

  @Get("rooms")
  async rooms(
    @Req() req: any,
    @Query("categoryId") categoryId?: string,
    @Query("keyword") keyword?: string,
    @Query("curPage") curPage = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.recommend.recommend(uid, categoryId, keyword, Number(curPage), Number(pageSize));
    return { status: true, msg: "ok", data };
  }
}
