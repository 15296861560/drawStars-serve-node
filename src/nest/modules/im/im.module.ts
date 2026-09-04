import { Module } from '@nestjs/common'
import { ImAuthController } from './auth/im-auth.controller'
import { ImAuthService } from './auth/im-auth.service'
import { ImWsGateway } from './gateway/im-ws.gateway'
import { ImPushBus } from './gateway/im-push-bus'
import { ImPresenceService } from './gateway/im-presence.service'
import { ImMessageService } from './message/im-message.service'
import { ImMessageController } from './message/im-message.controller'
import { ImConversationController } from './message/im-conversation.controller'
import { ImConversationService } from './conversation/im-conversation.service'
import { ImFriendController } from './relation/im-friend.controller'
import { ImFriendService } from './relation/im-friend.service'
import { ImBlacklistController } from './relation/im-blacklist.controller'
import { ImRelationService } from './relation/im-relation.service'
import { ImRoomController } from './room/im-room.controller'
import { ImRoomService } from './room/im-room.service'
import { ImHallController } from './room/im-hall.controller'
import { ImRecommendService } from './room/im-recommend.service'
import { ImGroupController } from './group/im-group.controller'
import { ImGroupService } from './group/im-group.service'
import { ImJoinRequestController } from './join/im-join-request.controller'
import { ImJoinRequestService } from './join/im-join-request.service'
import { ImReportController } from './moderation/im-report.controller'
import { ImSensitiveService } from './moderation/im-sensitive.service'
import { ImFilesController } from './files/im-files.controller'
import { ImAdminController } from './admin/im-admin.controller'
import { ImAnalyticsService } from './admin/im-analytics.service'
import { ImSettingsService } from './admin/im-settings.service'

@Module({
  controllers: [
    ImAuthController,
    ImMessageController,
    ImConversationController,
    ImFriendController,
    ImBlacklistController,
    ImRoomController,
    ImHallController,
    ImGroupController,
    ImJoinRequestController,
    ImReportController,
    ImFilesController,
    ImAdminController
  ],
  providers: [
    ImAuthService,
    ImPushBus,
    ImPresenceService,
    ImWsGateway,
    ImConversationService,
    ImMessageService,
    ImRelationService,
    ImFriendService,
    ImRoomService,
    ImRecommendService,
    ImGroupService,
    ImJoinRequestService,
    ImSensitiveService,
    ImAnalyticsService,
    ImSettingsService
  ],
  exports: [
    ImAuthService,
    ImMessageService,
    ImWsGateway,
    ImPushBus,
    ImPresenceService,
    ImConversationService
  ]
})
export class ImModule {}
