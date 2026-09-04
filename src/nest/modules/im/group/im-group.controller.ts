import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import { ImGroupService } from './im-group.service'
import { serializeBigInt } from '../../../../lib/serialize'

@Controller('im/groups')
export class ImGroupController {
  constructor(private readonly groupService: ImGroupService) {}

  @Post()
  async create(@Req() req: any, @Body() body: Record<string, unknown>) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.create(uid, body)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Get()
  async list(@Req() req: any) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.list(uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Get(':groupId')
  async get(@Param('groupId') groupId: string) {
    const data = await this.groupService.get(groupId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId')
  async update(
    @Req() req: any,
    @Param('groupId') groupId: string,
    @Body() body: Record<string, unknown>
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.update(groupId, uid, body)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/join')
  async join(@Req() req: any, @Param('groupId') groupId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.join(groupId, uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/leave')
  async leave(@Req() req: any, @Param('groupId') groupId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.leave(groupId, uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Get(':groupId/members')
  async members(@Param('groupId') groupId: string) {
    const data = await this.groupService.members(groupId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/mute')
  async mute(
    @Req() req: any,
    @Param('groupId') groupId: string,
    @Body()
    body: { targetUserId: string; duration: '10min' | '1h' | 'permanent' }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.mute(
      groupId,
      uid,
      body.targetUserId,
      body.duration
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/kick')
  async kick(
    @Req() req: any,
    @Param('groupId') groupId: string,
    @Body() body: { targetUserId: string }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.kick(groupId, uid, body.targetUserId)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/admins')
  async setAdmin(
    @Req() req: any,
    @Param('groupId') groupId: string,
    @Body() body: { targetUserId: string; isAdmin: boolean }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.setAdmin(
      groupId,
      uid,
      body.targetUserId,
      body.isAdmin
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/transfer')
  async transfer(
    @Req() req: any,
    @Param('groupId') groupId: string,
    @Body() body: { targetUserId: string }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.transfer(
      groupId,
      uid,
      body.targetUserId
    )
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  @Post(':groupId/dissolve')
  async dissolve(@Req() req: any, @Param('groupId') groupId: string) {
    const uid = String(req.auth?.uid ?? '')
    const data = await this.groupService.dissolve(groupId, uid)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }
}
