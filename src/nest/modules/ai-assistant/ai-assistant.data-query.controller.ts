import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { AI_QUERY_PERMISSION } from './ai-assistant.data-query.service'
import { AiAssistantService } from './ai-assistant.service'
import type { AiChatRequest } from './ai-assistant.types'

type DataQueryAuthInfo =
  | {
      uid?: string
      userId?: string
      permissions?: string[]
    }
  | undefined

/**
 * 显式数据问数接口（PRD 7.1：POST /api/ai-assistant/data-query）。
 * 独立于 @Public() 的对话 Controller：必须经 PermissionsGuard 校验
 * 问数功能权限码，guard 通过后 request.auth 携带权限快照供审计使用。
 */
@Controller('ai-assistant')
export class AiAssistantDataQueryController {
  constructor(private readonly aiAssistant: AiAssistantService) {}

  @Post('data-query')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(AI_QUERY_PERMISSION)
  async dataQuery(
    @CurrentUser() auth: DataQueryAuthInfo,
    @Body() body: AiChatRequest
  ) {
    return this.aiAssistant.dataQueryChat(auth, body)
  }
}
