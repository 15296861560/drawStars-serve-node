import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiAssistantLlmService } from "./ai-assistant.llm";
import { AiAssistantRepository } from "./ai-assistant.repository";
import { AiAssistantBaiduService } from "./ai-assistant.baidu.service";
import { AiAssistantFileService } from "./ai-assistant.file.service";
import { AiAssistantConfigService } from "./ai-assistant.config.service";

@Module({
  imports: [PrismaModule],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantConfigService,
    AiAssistantService,
    AiAssistantLlmService,
    AiAssistantRepository,
    AiAssistantBaiduService,
    AiAssistantFileService,
  ],
})
export class AiAssistantModule {}
