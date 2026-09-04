import { Injectable, OnModuleInit } from '@nestjs/common'
import { getAppInfo } from '../../../db/app-info'

/** app_info 中 openai 行：app_id=模型，app_certificate=API Key，app_version=Base URL（可选） */
export const APP_INFO_OPENAI = 'openai'

/** app_info 中 ai_assistant 行：app_certificate=系统提示词，app_id=上传大小上限 MB（可选） */
export const APP_INFO_AI_ASSISTANT = 'ai_assistant'

export const DEFAULT_AI_SYSTEM_PROMPT = `你是 DrawStars 站点内的 AI 助手，用简洁、友好的中文回答用户问题。
- 回答技术问题时可给出代码示例，代码放在 <pre><code> 标签内。
- 需要强调时使用 HTML：<p>、<ul>、<li>、<strong>，不要使用 Markdown 标题语法。
- 你是 drawStars 项目（Vue3 前端 + NestJS 后端）的结对编程助手。
- 若用户询问省市区，请调用 list_provinces 工具；天气、翻译由系统能力处理。`

export interface AiLlmConfig {
  apiKey: string
  model: string
  baseUrl: string
  systemPrompt: string
  maxFileMb: number
}

@Injectable()
export class AiAssistantConfigService implements OnModuleInit {
  private cache: { config: AiLlmConfig; expiresAt: number } | null = null
  private readonly cacheTtlMs = 60_000

  async onModuleInit() {
    const cfg = await this.getLlmConfig()
    if (!cfg.apiKey) {
      console.warn(
        `[ai-assistant] app_info 未配置 ${APP_INFO_OPENAI}（app_certificate 填 API Key），大模型对话将使用规则回复`
      )
    }
  }

  invalidateCache() {
    this.cache = null
  }

  async getLlmConfig(): Promise<AiLlmConfig> {
    const now = Date.now()
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.config
    }

    const [openai, assistant] = await Promise.all([
      getAppInfo(APP_INFO_OPENAI),
      getAppInfo(APP_INFO_AI_ASSISTANT)
    ])

    const maxFileRaw = assistant?.app_id?.trim()
    const maxFileMb = maxFileRaw ? Number(maxFileRaw) : 10

    const config: AiLlmConfig = {
      apiKey: openai?.app_certificate?.trim() || '',
      model: openai?.app_id?.trim() || 'gpt-4o-mini',
      baseUrl: (openai?.app_version?.trim() || '').replace(/\/$/, ''),
      systemPrompt:
        assistant?.app_certificate?.trim() || DEFAULT_AI_SYSTEM_PROMPT,
      maxFileMb: Number.isFinite(maxFileMb) && maxFileMb > 0 ? maxFileMb : 10
    }

    this.cache = { config, expiresAt: now + this.cacheTtlMs }
    return config
  }

  async isLlmEnabled(): Promise<boolean> {
    const cfg = await this.getLlmConfig()
    return Boolean(cfg.apiKey)
  }
}
