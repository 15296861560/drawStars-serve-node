import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'

@Controller('im/blacklist')
export class ImBlacklistController {
  @Get()
  async list(@Req() req: any) {
    const uid = BigInt(req.auth?.uid ?? 0)
    const rows = await prisma.imBlacklist.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(rows) }
  }

  @Post()
  async add(@Req() req: any, @Body() body: { targetId: string }) {
    const uid = BigInt(req.auth?.uid ?? 0)
    const target = BigInt(body.targetId)
    const row = await prisma.imBlacklist.upsert({
      where: { userId_targetId: { userId: uid, targetId: target } },
      create: { userId: uid, targetId: target, createdAt: BigInt(Date.now()) },
      update: {}
    })
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }

  @Delete()
  async remove(@Req() req: any, @Body() body: { targetId: string }) {
    const uid = BigInt(req.auth?.uid ?? 0)
    const target = BigInt(body.targetId)
    await prisma.imBlacklist.deleteMany({
      where: { userId: uid, targetId: target }
    })
    return { status: true, msg: 'ok', data: { targetId: body.targetId } }
  }
}
