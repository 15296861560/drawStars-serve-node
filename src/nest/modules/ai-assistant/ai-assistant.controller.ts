import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Formidable } from 'formidable'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AiAssistantService } from './ai-assistant.service'
import { AiAssistantFileService } from './ai-assistant.file.service'
import type { AiChatRequest, CreateConversationDto } from './ai-assistant.types'

@Controller('ai-assistant')
@Public()
export class AiAssistantController {
  constructor(
    private readonly aiAssistant: AiAssistantService,
    private readonly fileService: AiAssistantFileService
  ) {}

  @Get('conversations')
  listConversations(@CurrentUser() auth: { userId?: string } | undefined) {
    const key = this.aiAssistant.userKey(auth)
    return this.aiAssistant.getConversations(key)
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() auth: { userId?: string } | undefined,
    @Body() body: CreateConversationDto
  ) {
    const key = this.aiAssistant.userKey(auth)
    return this.aiAssistant.createConversation(key, body.title)
  }

  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() auth: { userId?: string } | undefined,
    @Param('id') id: string
  ) {
    const key = this.aiAssistant.userKey(auth)
    return this.aiAssistant.getMessages(key, id)
  }

  @Post('upload')
  upload(@Req() req: Request) {
    return new Promise((resolve, reject) => {
      const form = new Formidable({
        uploadDir: this.fileService.getUploadDir(),
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024
      })

      form.parse(req, async (err, _fields, files) => {
        if (err) {
          reject(err)
          return
        }

        const file = files.file?.[0]
        if (!file?.filepath) {
          reject(new Error('缺少文件'))
          return
        }

        try {
          await this.fileService.assertFileSize(file.size)
          const parsed = await this.fileService.saveAndParse(
            file.filepath,
            file.originalFilename || 'file',
            file.mimetype || 'application/octet-stream',
            file.size
          )
          resolve(parsed)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  @Post('chat')
  async chat(
    @CurrentUser() auth: { userId?: string } | undefined,
    @Body() body: AiChatRequest
  ) {
    const key = this.aiAssistant.userKey(auth)
    const extras = body.fileExcerpt
      ? { fileExcerpt: body.fileExcerpt }
      : undefined
    return this.aiAssistant.chat(key, body, extras)
  }

  @Post('chat/stream')
  @RawResponse()
  async chatStream(
    @CurrentUser() auth: { userId?: string } | undefined,
    @Body() body: AiChatRequest & { fileExcerpt?: string },
    @Res() res: Response
  ) {
    const key = this.aiAssistant.userKey(auth)
    const extras = body.fileExcerpt
      ? { fileExcerpt: body.fileExcerpt }
      : undefined
    await this.aiAssistant.chatStream(key, body, res, extras)
  }
}
