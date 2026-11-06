/**
 * 趣局模块：auth 登录（0 号端点）+ 22 端点
 * （session #1-8 / games #9-12 / wish #13-16 / profile #17-18 / tasks #19-21 / rank #22）
 * + Admin 域（PRD 7.1.4：questions/wordbank/themes/game-config/sessions/stats/reports）
 * - 无额外 imports：PrismaModule @Global、data 复制件为纯函数数据源
 * - PartyAuthService / TasksService / RankService 依赖 PartyProfileService（先声明）
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
import { PartyRankController } from './party.rank.controller'
import { PartyRankService } from './party.rank.service'
import { PartySessionController } from './party.session.controller'
import { PartySessionService } from './party.session.service'
import { PartyTasksController } from './party.tasks.controller'
import { PartyTasksService } from './party.tasks.service'
import { PartyWishController } from './party.wish.controller'
import { PartyWishService } from './party.wish.service'

@Module({
  controllers: [
    PartyAuthController,
    PartySessionController,
    PartyGamesController,
    PartyWishController,
    PartyProfileController,
    PartyTasksController,
    PartyRankController,
    PartyAdminController,
  ],
  providers: [
    PartyProfileService, // SessionService / PartyAuthService / Tasks / Rank 依赖（先声明）
    PartyGameService, // WS 编排 + 策略注册（SessionService 依赖，先声明）
    PartySessionService,
    PartyGamesService,
    PartyWishService,
    PartyTasksService, // 任务中心（端点 #19-21：bump 记账 / claim 事务入账）
    PartyRankService, // 星光总榜（端点 #22）
    PartyAdminService,
    PartyAuthService,
  ],
})
export class PartyModule {}
