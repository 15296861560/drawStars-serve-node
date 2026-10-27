import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { RbacModule } from '../rbac/rbac.module'
import { AiAssistantController } from './ai-assistant.controller'
import { AiAssistantDataQueryController } from './ai-assistant.data-query.controller'
import { AiAssistantService } from './ai-assistant.service'
import { AiAssistantLlmService } from './ai-assistant.llm'
import { AiAssistantRepository } from './ai-assistant.repository'
import { AiAssistantBaiduService } from './ai-assistant.baidu.service'
import { AiAssistantFileService } from './ai-assistant.file.service'
import { AiAssistantConfigService } from './ai-assistant.config.service'
import { AiAssistantDataQueryService } from './ai-assistant.data-query.service'

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [AiAssistantController, AiAssistantDataQueryController],
  providers: [
    AiAssistantConfigService,
    AiAssistantService,
    AiAssistantLlmService,
    AiAssistantRepository,
    AiAssistantBaiduService,
    AiAssistantFileService,
    AiAssistantDataQueryService
  ]
})
export class AiAssistantModule {}
