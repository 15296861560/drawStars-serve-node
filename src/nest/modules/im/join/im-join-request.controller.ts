import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req
} from '@nestjs/common'
import { ImJoinRequestService } from './im-join-request.service'
import { serializeBigInt } from '../../../../lib/serialize'

@Controller('im/join-requests')
export class ImJoinRequestController {
  constructor(private readonly reqService: ImJoinRequestService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('scope') scope: 'mine' | 'manage' = 'mine'
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.reqService.list(uid, scope)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { targetType: string; targetId: string; remark?: string }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.reqService.create(
      uid,
      body.targetType,
      body.targetId,
      body.remark
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':id/approve')
  async approve(@Req() req: any, @Param('id') id: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.reqService.approve(uid, id)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':id/reject')
  async reject(@Req() req: any, @Param('id') id: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.reqService.reject(uid, id)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Delete(':id')
  async withdraw(@Req() req: any, @Param('id') id: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.reqService.withdraw(uid, id)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }
}
