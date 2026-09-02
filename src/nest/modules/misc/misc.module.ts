import { Module } from "@nestjs/common";
import { TestController } from "./test.controller";
import { ResourceController } from "./resource.controller";
import { NotifyController } from "./notify.controller";
import { BaiduController } from "./baidu.controller";
import { AmapController } from "./amap.controller";
import { StatisticsController } from "./statistics.controller";
import { TranslateController } from "./translate.controller";
import { AgoraController } from "./agora.controller";
import { PayController } from "./pay.controller";
import { ControllerController } from "./controller.controller";
import { ControllerService } from "./controller.service";
import { AppManageController } from "./app-manage.controller";
import { AppManageService } from "./app-manage.service";
import { NoticeManageController } from "./notice-manage.controller";
import { NoticeManageService } from "./notice-manage.service";
import { MobileModule } from "../mobile/mobile.module";

@Module({
  imports: [MobileModule],
  controllers: [
    TestController,
    ResourceController,
    NotifyController,
    BaiduController,
    AmapController,
    StatisticsController,
    TranslateController,
    AgoraController,
    PayController,
    ControllerController,
    AppManageController,
    NoticeManageController,
  ],
  providers: [ControllerService, AppManageService, NoticeManageService],
})
export class MiscModule {}
