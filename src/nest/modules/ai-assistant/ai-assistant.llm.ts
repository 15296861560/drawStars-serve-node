import { Injectable } from '@nestjs/common'
import { ChatOpenAI } from '@langchain/openai'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage
} from '@langchain/core/messages'
import type { AiMessage } from './ai-assistant.types'
import {
  AiAssistantConfigService,
  type AiLlmConfig
} from './ai-assistant.config.service'

export type LlmStreamChunk = {
  kind: 'thinking' | 'answer'
  text: string
}

@Injectable()
export class AiAssistantLlmService {
  constructor(private readonly aiConfig: AiAssistantConfigService) {}

  async isEnabled(): Promise<boolean> {
    return this.aiConfig.isLlmEnabled()
  }

  private createModel(cfg: AiLlmConfig, streaming = false) {
    return new ChatOpenAI({
      apiKey: cfg.apiKey,
      model: cfg.model,
      temperature: 0.6,
      streaming,
      /** 兼容 OpenAI 代理；Responses API 在部分网关下会返回空 generations */
      useResponsesApi: false,
      ...(cfg.baseUrl
        ? { configuration: { baseURL: cfg.baseUrl.replace(/\/$/, '') } }
        : {})
    })
  }

  private historyToMessages(history: AiMessage[]): BaseMessage[] {
    return history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map(m =>
        m.role === 'user'
          ? new HumanMessage(m.content)
          : new AIMessage(m.content.replace(/<[^>]+>/g, ' ').slice(0, 2000))
      )
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
      return content
        .map(part =>
          typeof part === 'string'
            ? part
            : part && typeof part === 'object' && 'text' in part
              ? String((part as { text?: string }).text ?? '')
              : ''
        )
        .join('')
        .trim()
    }
    return String(content ?? '').trim()
  }

  private extractChunkText(chunk: unknown): string {
    if (chunk == null) return ''
    if (typeof chunk === 'string') return chunk
    if (typeof chunk === 'object') {
      const obj = chunk as Record<string, unknown>
      if (typeof obj.text === 'string' && obj.text) return obj.text
      if ('content' in obj) return this.extractText(obj.content)
    }
    return ''
  }

  private extractReasoningChunkText(chunk: unknown): string {
    if (chunk == null || typeof chunk !== 'object') return ''
    const obj = chunk as Record<string, unknown>
    const kwargs = obj.additional_kwargs as Record<string, unknown> | undefined
    if (kwargs) {
      if (typeof kwargs.reasoning_content === 'string') {
        return kwargs.reasoning_content
      }
      if (typeof kwargs.reasoning === 'string') {
        return kwargs.reasoning
      }
    }
    if (Array.isArray(obj.content)) {
      return obj.content
        .map(part => {
          if (!part || typeof part !== 'object') return ''
          const block = part as { type?: string; text?: string }
          if (block.type === 'reasoning' && block.text) return block.text
          return ''
        })
        .join('')
    }
    return ''
  }

  private formatError(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const nested = (error as { error?: { message?: string } }).error
      if (nested?.message) return nested.message
    }
    if (error instanceof Error) return error.message
    return String(error)
  }

  private async *yieldTextInSteps(
    text: string,
    kind: LlmStreamChunk['kind'] = 'answer'
  ): AsyncGenerator<LlmStreamChunk> {
    const step = Math.max(1, Math.ceil(text.length / 48))
    for (let i = 0; i < text.length; i += step) {
      yield { kind, text: text.slice(i, i + step) }
    }
  }

  private buildPromptMessages(
    cfg: AiLlmConfig,
    userText: string,
    history: AiMessage[],
    fileExcerpt?: string
  ): BaseMessage[] {
    let human = userText
    if (fileExcerpt) {
      human = `用户上传了文件，解析摘要如下：\n${fileExcerpt}\n\n用户问题：${userText || '请总结该文件'}`
    }
    return [
      new SystemMessage(cfg.systemPrompt),
      ...this.historyToMessages(history),
      new HumanMessage(human)
    ]
  }

  /**
   * 数据问数 NL2SQL（PRD 4.5.3）：按白名单数据字典生成候选只读 SQL。
   * 生成结果仍须经过词法校验器（ai-assistant.data-query.service）方可执行。
   */
  async generateSql(question: string, tableDict: string): Promise<string> {
    const cfg = await this.aiConfig.getLlmConfig()
    if (!cfg.apiKey) return ''

    const messages: BaseMessage[] = [
      new SystemMessage(
        [
          '你是数据查询 SQL 生成器。仅输出一条 MySQL 只读查询 SQL（以 SELECT 开头），不要输出任何解释、注释或 Markdown 代码块。',
          '规则：',
          '1. 只能查询数据字典中列出的表；可在这些表之间 JOIN。',
          '2. 时间条件使用 NOW()/CURDATE()/DATE_SUB() 等函数推算，不要编造参数。',
          '3. 所有输出列必须加中文别名（例如：SELECT COUNT(*) AS `总数`）。',
          '4. 结尾不写分号；禁止任何写操作与注释。',
          "5. 若无法只用数据字典中的表回答，输出：SELECT 'CANNOT_ANSWER' AS `提示`"
        ].join('\n')
      ),
      new HumanMessage(
        `可查询表结构数据字典：\n${tableDict}\n\n用户问题：${question}`
      )
    ]

    try {
      const model = this.createModel(cfg)
      const response = await model.invoke(messages)
      return this.extractText(response.content)
    } catch (error) {
      console.error('[ai-assistant] NL2SQL error:', this.formatError(error))
      return ''
    }
  }

  async chat(
    userText: string,
    history: AiMessage[],
    fileExcerpt?: string
  ): Promise<string> {
    const cfg = await this.aiConfig.getLlmConfig()
    if (!cfg.apiKey) return ''

    const model = this.createModel(cfg)
    const messages = this.buildPromptMessages(
      cfg,
      userText,
      history,
      fileExcerpt
    )

    try {
      const response = await model.invoke(messages)
      return this.extractText(response.content)
    } catch (error) {
      console.error('[ai-assistant] LLM error:', this.formatError(error))
      return ''
    }
  }

  async *streamChat(
    userText: string,
    history: AiMessage[],
    fileExcerpt?: string
  ): AsyncGenerator<LlmStreamChunk> {
    const cfg = await this.aiConfig.getLlmConfig()
    if (!cfg.apiKey) return

    const messages = this.buildPromptMessages(
      cfg,
      userText,
      history,
      fileExcerpt
    )

    let yieldedAnswer = false

    try {
      const model = this.createModel(cfg, true)
      const stream = await model.stream(messages)
      for await (const chunk of stream) {
        const reasoning = this.extractReasoningChunkText(chunk)
        if (reasoning) {
          yield { kind: 'thinking', text: reasoning }
        }
        const piece = this.extractChunkText(chunk)
        if (piece) {
          yieldedAnswer = true
          yield { kind: 'answer', text: piece }
        }
      }
    } catch (error) {
      console.error('[ai-assistant] LLM stream error:', this.formatError(error))
    }

    if (!yieldedAnswer) {
      const full = await this.chat(userText, history, fileExcerpt)
      if (full) {
        yield* this.yieldTextInSteps(full, 'answer')
      }
    }
  }
}
