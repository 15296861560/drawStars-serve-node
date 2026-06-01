import { Module } from "@nestjs/common";
import { TestController } from "./test.controller";
import { ResourceController } from "./resource.controller";
import { NotifyController } from "./notify.controller";
import { BaiduController } from "./baidu.controller";
import { StatisticsController } from "./statistics.controller";
import { TranslateController } from "./translate.controller";
import { AgoraController } from "./agora.controller";
import { PayController } from "./pay.controller";
import { ControllerController } from "./controller.controller";
import { ControllerService } from "./controller.service";

@Module({
  controllers: [
    TestController,
    ResourceController,
    NotifyController,
    BaiduController,
    StatisticsController,
    TranslateController,
    AgoraController,
    PayController,
    ControllerController,
  ],
  providers: [ControllerService],
})
export class MiscModule {}
