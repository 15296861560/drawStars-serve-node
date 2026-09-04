import { Body, Controller, Post, Req } from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'
import { ReportStatus } from '../im.constants'

@Controller('im/reports')
export class ImReportController {
  @Post()
  async create(
    @Req() req: any,
    @Body() body: { targetType: string; targetId: string; reason: string }
  ) {
    const uid = String(req.auth?.uid ?? '')
    const row = await prisma.imReport.create({
      data: {
        reporterId: BigInt(uid),
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        status: ReportStatus.PENDING,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now())
      }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }
}
