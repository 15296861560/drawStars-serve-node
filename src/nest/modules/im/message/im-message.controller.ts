import { Body, Controller, Param, Post, Req } from '@nestjs/common'
import { ImMessageService } from './im-message.service'
import { serializeBigInt } from '../../../../lib/serialize'
import type { SendMessageDto } from '../im.types'

@Controller('im/messages')
export class ImMessageController {
  constructor(private readonly messageService: ImMessageService) {}

  @Post('send')
  async send(@Req() req: any, @Body() body: SendMessageDto) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.messageService.send(uid, body)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':msgId/recall')
  async recall(@Req() req: any, @Param('msgId') msgId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.messageService.recall(uid, msgId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':msgId/delete')
  async delete(@Req() req: any, @Param('msgId') msgId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.messageService.deleteForMe(uid, msgId)
    return { status: true, msg: 'ok', data }
  }

  @Post(':msgId/forward')
  async forward(
    @Req() req: any,
    @Param('msgId') msgId: string,
    @Body() body: { target: { convType: string; bizId: string } }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.messageService.forward(
      uid,
      msgId,
      body.target as never
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }
}
