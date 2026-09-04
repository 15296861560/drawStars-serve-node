import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import { ImFriendService } from './im-friend.service'
import { serializeBigInt } from '../../../../lib/serialize'

@Controller('im/friends')
export class ImFriendController {
  constructor(private readonly friendService: ImFriendService) {}

  @Get()
  async list(@Req() req: any) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.list(uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Get('pending')
  async pending(@Req() req: any) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.pendingReceived(uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post('request')
  async request(
    @Req() req: any,
    @Body() body: { friendId: string; remark?: string }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.request(
      uid,
      body.friendId,
      body.remark
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post('respond')
  async respond(
    @Req() req: any,
    @Body() body: { friendId: string; accept: boolean }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.respond(
      uid,
      body.friendId,
      body.accept
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Delete('request')
  async withdraw(@Req() req: any, @Body() body: { friendId: string }) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.withdraw(uid, body.friendId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Delete(':friendId')
  async remove(@Req() req: any, @Param('friendId') friendId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.friendService.remove(uid, friendId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }
}
