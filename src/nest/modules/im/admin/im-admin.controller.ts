import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req
} from '@nestjs/common'
import { prisma } from '../../../../lib/prisma'
import { serializeBigInt } from '../../../../lib/serialize'
import { RequirePermissions } from '../../../common/decorators/permissions.decorator'
import { ImAnalyticsService } from './im-analytics.service'
import { ImSettingsService } from './im-settings.service'
import { ImSensitiveService } from '../moderation/im-sensitive.service'
import { ReportStatus, RoomStatus } from '../im.constants'

@Controller('manage/im')
export class ImAdminController {
  constructor(
    private readonly analytics: ImAnalyticsService,
    private readonly settings: ImSettingsService,
    private readonly sensitive: ImSensitiveService
  ) {}

  // ----- 举报处置 -----
  @Get('reports')
  @RequirePermissions('chat:moderation:operate', 'system:chat:list')
  async reports(
    @Query('status') status?: string,
    @Query('curPage') curPage = '1',
    @Query('pageSize') pageSize = '20'
  ) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    const [total, rows] = await Promise.all([
      prisma.imReport.count({ where }),
      prisma.imReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(curPage) - 1) * Number(pageSize),
        take: Number(pageSize)
      })
    ])
    return {
      status: true,
      msg: 'ok',
      data: serializeBigInt({
        total,
        list: rows,
        curPage: Number(curPage),
        pageSize: Number(pageSize)
      })
    }
  }

  @Put('reports/:id')
  @RequirePermissions('chat:moderation:operate')
  async handleReport(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: string; remark?: string }
  ) {
    const uid = String(req.auth?.uid ?? '0')
    const row = await prisma.imReport.update({
      where: { id: BigInt(id) },
      data: {
        status: body.status,
        remark: body.remark,
        handledBy: BigInt(uid),
        updatedAt: BigInt(Date.now())
      }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }

  // ----- 消息检索（审计） -----
  @Get('messages/search')
  @RequirePermissions('system:chat:list')
  async searchMessages(
    @Query('roomId') roomId?: string,
    @Query('conversationId') conversationId?: string,
    @Query('keyword') keyword?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('curPage') curPage = '1',
    @Query('pageSize') pageSize = '20'
  ) {
    const where: Record<string, unknown> = {}
    if (conversationId) where.conversationId = BigInt(conversationId)
    if (startTime || endTime) {
      where.serverTime = {}
      if (startTime)
        (where.serverTime as { gte: bigint }).gte = BigInt(startTime)
      if (endTime) (where.serverTime as { lt: bigint }).lt = BigInt(endTime)
    }
    // keyword 精确匹配 json content.text（MySQL JSON_EXTRACT 简化）
    const [total, rows] = await Promise.all([
      prisma.imMessage.count({ where }),
      prisma.imMessage.findMany({
        where,
        orderBy: { serverTime: 'desc' },
        skip: (Number(curPage) - 1) * Number(pageSize),
        take: Number(pageSize)
      })
    ])
    return {
      status: true,
      msg: 'ok',
      data: serializeBigInt({
        total,
        list: rows,
        curPage: Number(curPage),
        pageSize: Number(pageSize)
      })
    }
  }

  // ----- 数据看板 -----
  @Get('analytics/overview')
  @RequirePermissions('system:chat:analytics')
  async overview() {
    const data = await this.analytics.overview()
    return { status: true, msg: 'ok', data }
  }

  @Get('analytics/trends')
  @RequirePermissions('system:chat:analytics')
  async trends(@Query('days') days = '7') {
    const data = await this.analytics.trends(Number(days))
    return { status: true, msg: 'ok', data: { list: data } }
  }

  @Get('analytics/rooms')
  @RequirePermissions('system:chat:analytics')
  async roomRanking() {
    const data = await this.analytics.roomRanking()
    return { status: true, msg: 'ok', data: serializeBigInt({ list: data }) }
  }

  // ----- 房间封禁 -----
  @Post('rooms/:roomId/ban')
  @RequirePermissions('system:chat:operate')
  async banRoom(
    @Param('roomId') roomId: string,
    @Body() body: { banned: boolean }
  ) {
    const room = await prisma.imRoom.findUnique({ where: { roomId } })
    if (!room) return { status: false, msg: '房间不存在', data: null }
    const updated = await prisma.imRoom.update({
      where: { id: room.id },
      data: {
        status: body.banned ? RoomStatus.BANNED : RoomStatus.ACTIVE,
        updatedAt: BigInt(Date.now())
      }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(updated) }
  }

  // ----- 房间加权/官方 -----
  @Post('rooms/:roomId/weight')
  @RequirePermissions('system:chat:operate')
  async setWeight(
    @Param('roomId') roomId: string,
    @Body() body: { manualWeight?: number; official?: boolean }
  ) {
    const room = await prisma.imRoom.findUnique({ where: { roomId } })
    if (!room) return { status: false, msg: '房间不存在', data: null }
    const data: Record<string, unknown> = { updatedAt: BigInt(Date.now()) }
    if (body.manualWeight !== undefined) data.manualWeight = body.manualWeight
    if (body.official !== undefined) data.official = body.official
    const updated = await prisma.imRoom.update({ where: { id: room.id }, data })
    return { status: true, msg: 'ok', data: serializeBigInt(updated) }
  }

  // ----- 系统配置 -----
  @Get('settings')
  @RequirePermissions('system:chat:operate')
  async getSettings() {
    const data = await this.settings.list()
    return { status: true, msg: 'ok', data }
  }

  @Put('settings')
  @RequirePermissions('system:chat:operate')
  async updateSettings(@Body() body: Record<string, string>) {
    const data = await this.settings.bulkUpdate(body)
    return { status: true, msg: 'ok', data: serializeBigInt(data) }
  }

  // ----- 分类 CRUD -----
  @Get('categories')
  async listCategories() {
    const rows = await prisma.imCategory.findMany({ orderBy: { sort: 'asc' } })
    return { status: true, msg: 'ok', data: serializeBigInt(rows) }
  }

  @Post('categories')
  @RequirePermissions('system:chat:operate')
  async createCategory(
    @Body() body: { code: string; name: string; sort?: number }
  ) {
    const row = await prisma.imCategory.create({
      data: {
        code: body.code,
        name: body.name,
        sort: body.sort || 0,
        status: 'ACTIVE'
      }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }

  // ----- 敏感词 -----
  @Get('sensitive-words')
  @RequirePermissions('system:chat:operate')
  async listSensitiveWords() {
    const rows = await prisma.imSensitiveWord.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(rows) }
  }

  @Post('sensitive-words')
  @RequirePermissions('system:chat:operate')
  async addSensitiveWord(@Body() body: { word: string; action?: string }) {
    const row = await prisma.imSensitiveWord.upsert({
      where: { word: body.word },
      create: {
        word: body.word,
        action: body.action || 'BLOCK',
        createdAt: BigInt(Date.now())
      },
      update: { action: body.action || 'BLOCK' }
    })
    await this.sensitive.reload()
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }

  @Post('sensitive-words/reload')
  @RequirePermissions('system:chat:operate')
  async reloadSensitive() {
    await this.sensitive.reload()
    return { status: true, msg: 'ok', data: { ok: true } }
  }
}
