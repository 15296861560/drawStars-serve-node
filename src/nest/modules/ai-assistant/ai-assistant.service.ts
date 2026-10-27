import { Injectable } from '@nestjs/common'
import type { Response } from 'express'
import type {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  AiMessage
} from './ai-assistant.types'
import { AiAssistantRepository } from './ai-assistant.repository'
import {
  defaultCapabilityReply,
  resolveCapability
} from './ai-assistant.capabilities'
import { AiAssistantLlmService } from './ai-assistant.llm'
import {
  AiAssistantDataQueryService,
  type DataQueryAuth
} from './ai-assistant.data-query.service'
import { AiAssistantBaiduService } from './ai-assistant.baidu.service'
import type { ParsedUploadFile } from './ai-assistant.file.service'

export interface ChatExtras {
  fileMeta?: ParsedUploadFile
  fileExcerpt?: string
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly repo: AiAssistantRepository,
    private readonly llm: AiAssistantLlmService,
    private readonly baidu: AiAssistantBaiduService,
    private readonly dataQuery: AiAssistantDataQueryService
  ) {}

  /** 从会话主键还原问数身份（guest 无 uid，问数管道内统一拦截） */
  private dqAuthFromKey(userKey: string): DataQueryAuth | undefined {
    return userKey.startsWith('user:')
      ? { uid: userKey.slice('user:'.length) }
      : undefined
  }

  userKey(auth?: { userId?: string | number } | null): string {
    if (auth?.userId != null) return `user:${auth.userId}`
    return 'guest'
  }

  getConversations(userKey: string): Promise<AiConversation[]> {
    return this.repo.listConversations(userKey)
  }

  getMessages(userKey: string, conversationId: string): Promise<AiMessage[]> {
    return this.repo.getMessages(userKey, conversationId)
  }

  createConversation(userKey: string, title?: string): Promise<AiConversation> {
    return this.repo.createConversation(userKey, title || '新对话')
  }

  private async ensureConversationId(
    userKey: string,
    conversationId?: string
  ): Promise<string> {
    if (conversationId) {
      try {
        await this.repo.assertConversation(userKey, conversationId)
        return conversationId
      } catch {
        /* fall through */
      }
    }
    const conv = await this.repo.createConversation(userKey)
    return conv.id
  }

  private buildUserMessageInput(
    conversationId: string,
    body: AiChatRequest,
    extras?: ChatExtras
  ): Omit<AiMessage, 'id' | 'createdAt'> {
    const userType = body.type || (extras?.fileMeta ? 'file' : 'text')
    let content = body.content
    if (extras?.fileMeta) {
      content = body.content?.trim() || `上传文件：${extras.fileMeta.name}`
    }

    const base: Omit<AiMessage, 'id' | 'createdAt'> = {
      conversationId,
      role: 'user',
      type: userType,
      content
    }

    if (userType === 'voice') {
      base.payload = {
        durationSec: 0,
        transcript: body.content,
        audioUrl: ''
      }
    }

    if (extras?.fileMeta) {
      base.type = 'file'
      base.payload = {
        name: extras.fileMeta.name,
        size: extras.fileMeta.size,
        mimeType: extras.fileMeta.mimeType,
        url: extras.fileMeta.url,
        fileId: extras.fileMeta.fileId,
        excerpt: extras.fileMeta.excerpt?.slice(0, 500)
      }
    }

    return base
  }

  private formatLlmHtml(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) return ''
    return trimmed.includes('<')
      ? trimmed
      : `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`
  }

  private async buildAssistantReply(
    userKey: string,
    conversationId: string,
    userText: string,
    userType: AiMessage['type'],
    history: AiMessage[],
    extras?: ChatExtras
  ): Promise<Omit<AiMessage, 'id' | 'createdAt'>> {
    const capability = await resolveCapability(
      userText,
      conversationId,
      userType,
      {
        baidu: this.baidu,
        fileExcerpt: extras?.fileExcerpt
      }
    )

    if (capability) return capability

    if (!extras?.fileMeta && this.dataQuery.isQueryIntent(userText)) {
      const { reply } = await this.dataQuery.run({
        question: userText,
        conversationId,
        auth: this.dqAuthFromKey(userKey)
      })
      return reply
    }

    const llmText = await this.llm.chat(userText, history, extras?.fileExcerpt)
    if (llmText) {
      return {
        conversationId,
        role: 'assistant',
        type: 'rich',
        content: this.formatLlmHtml(llmText),
        capabilityId: 'llm'
      }
    }

    if (extras?.fileExcerpt) {
      return {
        conversationId,
        role: 'assistant',
        type: 'rich',
        content: `<p>文件摘要：</p><pre>${extras.fileExcerpt.slice(0, 1200).replace(/</g, '&lt;')}</pre>`,
        capabilityId: 'file'
      }
    }

    return defaultCapabilityReply(
      userText,
      conversationId,
      await this.llm.isEnabled()
    )
  }

  async chat(
    userKey: string,
    body: AiChatRequest,
    extras?: ChatExtras
  ): Promise<AiChatResponse> {
    const conversationId = await this.ensureConversationId(
      userKey,
      body.conversationId
    )
    body.conversationId = conversationId

    const history = await this.repo.getMessages(userKey, conversationId)
    const userInput = this.buildUserMessageInput(conversationId, body, extras)
    const userMessage = await this.repo.saveMessage(conversationId, userInput)

    const assistantBase = await this.buildAssistantReply(
      userKey,
      conversationId,
      body.content,
      userInput.type,
      history,
      extras
    )

    const assistantMessage = await this.repo.saveMessage(
      conversationId,
      assistantBase
    )

    if (
      body.content &&
      (await this.repo.getConversation(userKey, conversationId))?.title ===
        '新对话'
    ) {
      await this.repo.touchConversation(conversationId, {
        title: body.content.slice(0, 16) || '新对话'
      })
    }

    return { userMessage, assistantMessage }
  }

  /**
   * 显式数据问数对话（PRD 7.1：POST /api/ai-assistant/data-query）：
   * 与 chat 保持一致的消息落库与会话标题初始化，回复由问数管道生成。
   */
  async dataQueryChat(
    auth: { userId?: string; uid?: string; permissions?: string[] } | undefined,
    body: AiChatRequest
  ): Promise<AiChatResponse & { sqlAuditId?: string }> {
    const userId = auth?.userId ?? auth?.uid
    const userKey = userId != null ? `user:${userId}` : 'guest'
    const conversationId = await this.ensureConversationId(
      userKey,
      body.conversationId
    )
    body.conversationId = conversationId

    const userInput = this.buildUserMessageInput(conversationId, body)
    const userMessage = await this.repo.saveMessage(conversationId, userInput)

    const { reply, sqlAuditId } = await this.dataQuery.run({
      question: body.content,
      conversationId,
      auth: {
        uid: userId != null ? String(userId) : undefined,
        permissions: auth?.permissions
      }
    })
    const assistantMessage = await this.repo.saveMessage(conversationId, reply)

    if (
      body.content &&
      (await this.repo.getConversation(userKey, conversationId))?.title ===
        '新对话'
    ) {
      await this.repo.touchConversation(conversationId, {
        title: body.content.slice(0, 16) || '新对话'
      })
    }

    return { userMessage, assistantMessage, sqlAuditId }
  }

  writeSse(res: Response, event: string, data: unknown) {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  async chatStream(
    userKey: string,
    body: AiChatRequest,
    res: Response,
    extras?: ChatExtras
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    try {
      const conversationId = await this.ensureConversationId(
        userKey,
        body.conversationId
      )
      body.conversationId = conversationId

      const history = await this.repo.getMessages(userKey, conversationId)
      const userInput = this.buildUserMessageInput(conversationId, body, extras)
      const userMessage = await this.repo.saveMessage(conversationId, userInput)
      this.writeSse(res, 'userMessage', userMessage)

      const capability = await resolveCapability(
        body.content,
        conversationId,
        userInput.type,
        { baidu: this.baidu, fileExcerpt: extras?.fileExcerpt }
      )

      let fullText = ''
      let assistantBase: Omit<AiMessage, 'id' | 'createdAt'>

      if (capability) {
        assistantBase = capability
        fullText = capability.content
        this.writeSse(res, 'delta', { content: fullText })
      } else if (
        !extras?.fileMeta &&
        this.dataQuery.isQueryIntent(body.content)
      ) {
        // 问数分支（PRD 4.5.3）：过程文案走 thinkingDelta，最终一次性 delta
        this.writeSse(res, 'thinkingStart', {})
        const { reply } = await this.dataQuery.run({
          question: body.content,
          conversationId,
          auth: this.dqAuthFromKey(userKey),
          onProgress: text =>
            this.writeSse(res, 'thinkingDelta', { content: text })
        })
        assistantBase = reply
        fullText = reply.content
        this.writeSse(res, 'delta', { content: fullText })
      } else if (await this.llm.isEnabled()) {
        assistantBase = {
          conversationId,
          role: 'assistant',
          type: 'rich',
          content: '',
          capabilityId: 'llm'
        }
        let fullThinking = ''
        this.writeSse(res, 'thinkingStart', {})
        for await (const chunk of this.llm.streamChat(
          body.content,
          history,
          extras?.fileExcerpt
        )) {
          if (chunk.kind === 'thinking') {
            fullThinking += chunk.text
            this.writeSse(res, 'thinkingDelta', { content: chunk.text })
            continue
          }
          fullText += chunk.text
          this.writeSse(res, 'delta', { content: chunk.text })
        }
        if (fullThinking.trim()) {
          assistantBase.payload = { thinking: fullThinking }
        }

        if (!fullText.trim()) {
          fullText = await this.llm.chat(
            body.content,
            history,
            extras?.fileExcerpt
          )
          if (fullText) {
            this.writeSse(res, 'delta', { content: fullText })
          }
        }

        if (fullText.trim()) {
          assistantBase.content = this.formatLlmHtml(fullText)
        } else {
          assistantBase = defaultCapabilityReply(
            body.content,
            conversationId,
            true
          )
          fullText = assistantBase.content
          this.writeSse(res, 'delta', { content: fullText })
        }
      } else {
        assistantBase = defaultCapabilityReply(
          body.content,
          conversationId,
          false
        )
        if (extras?.fileExcerpt) {
          assistantBase.type = 'rich'
          assistantBase.content = `<p>文件摘要：</p><pre>${extras.fileExcerpt.slice(0, 1200).replace(/</g, '&lt;')}</pre>`
          assistantBase.capabilityId = 'file'
        }
        fullText = assistantBase.content
        this.writeSse(res, 'delta', { content: fullText })
      }

      const assistantMessage = await this.repo.saveMessage(
        conversationId,
        assistantBase
      )

      if (
        body.content &&
        (await this.repo.getConversation(userKey, conversationId))?.title ===
          '新对话'
      ) {
        await this.repo.touchConversation(conversationId, {
          title: body.content.slice(0, 16) || '新对话'
        })
      }

      this.writeSse(res, 'done', { userMessage, assistantMessage })
    } catch (error) {
      console.error('[ai-assistant] stream error:', error)
      this.writeSse(res, 'error', {
        message: error instanceof Error ? error.message : 'stream failed'
      })
    } finally {
      res.end()
    }
  }
}
