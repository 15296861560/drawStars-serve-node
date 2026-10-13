/**
 * 星会模块：18 端点（session #1-8 / games #9-12 / wish #13-16 / profile #17-18）
 * - 无额外 imports：PrismaModule @Global、data 复制件为纯函数数据源
 */
import { Module } from '@nestjs/common'
import { PartyGamesController } from './party.games.controller'
import { PartyGamesService } from './party.games.service'
import { PartyProfileController } from './party.profile.controller'
import { PartyProfileService } from './party.profile.service'
import { PartySessionController } from './party.session.controller'
import { PartySessionService } from './party.session.service'
import { PartyWishController } from './party.wish.controller'
import { PartyWishService } from './party.wish.service'

@Module({
  controllers: [
    PartySessionController,
    PartyGamesController,
    PartyWishController,
    PartyProfileController,
  ],
  providers: [
    PartyProfileService, // SessionService 依赖（先声明）
    PartySessionService,
    PartyGamesService,
    PartyWishService,
  ],
})
export class PartyModule {}
