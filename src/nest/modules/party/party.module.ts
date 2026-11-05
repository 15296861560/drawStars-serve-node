/**
 * 趣局模块：auth 登录（0 号端点）+ 18 端点（session #1-8 / games #9-12 / wish #13-16 / profile #17-18）
 * + Admin 域（PRD 7.1.4：questions/wordbank/themes/game-config/sessions/stats/reports）
 * - 无额外 imports：PrismaModule @Global、data 复制件为纯函数数据源
 * - PartyAuthService 依赖 PartyProfileService（先声明）
 */
import { Module } from '@nestjs/common'
import { PartyAuthController } from './party.auth.controller'
import { PartyAuthService } from './party.auth.service'
import { PartyAdminController } from './party.admin.controller'
import { PartyAdminService } from './party.admin.service'
import { PartyGamesController } from './party.games.controller'
import { PartyGamesService } from './party.games.service'
import { PartyGameService } from './games/party.game.service'
import { PartyProfileController } from './party.profile.controller'
import { PartyProfileService } from './party.profile.service'
import { PartySessionController } from './party.session.controller'
import { PartySessionService } from './party.session.service'
import { PartyWishController } from './party.wish.controller'
import { PartyWishService } from './party.wish.service'

@Module({
  controllers: [
    PartyAuthController,
    PartySessionController,
    PartyGamesController,
    PartyWishController,
    PartyProfileController,
    PartyAdminController,
  ],
  providers: [
    PartyProfileService, // SessionService / PartyAuthService 依赖（先声明）
    PartyGameService, // WS 编排 + 策略注册（SessionService 依赖，先声明）
    PartySessionService,
    PartyGamesService,
    PartyWishService,
    PartyAdminService,
    PartyAuthService,
  ],
})
export class PartyModule {}
