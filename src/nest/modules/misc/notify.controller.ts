import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import Notify from '../../../public/provider/notify'
import {
  getAccessTokenFromRequest,
  verifyAccessToken
} from '../../../lib/access-token-service'

type AuthReq = {
  headers?: Record<string, unknown>
  query?: Record<string, unknown>
  cookies?: Record<string, string>
  auth?: { uid?: string }
}

@Controller('notifyApi')
export class NotifyController {
  private resolveUserId(req: AuthReq, queryUserId?: string): string | null {
    if (queryUserId) return String(queryUserId)
    if (req.auth?.uid) return String(req.auth.uid)
    const token = getAccessTokenFromRequest(req as never)
    if (token) {
      const info = verifyAccessToken(token)
      if (info && info.uid) return String(info.uid)
    }
    return null
  }

  @Get('queryNotifyById')
  async queryNotifyById(@Query('notifyId') notifyId: string) {
    try {
      const data = await Notify.queryNotifyById(notifyId)
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'queryNotifyById failed',
        data: null
      }
    }
  }

  @Get('queryNotifyByType')
  async queryNotifyByType(@Query('notifyType') notifyType: string) {
    try {
      const data = await Notify.queryNotifyByType(notifyType)
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg:
          error instanceof Error ? error.message : 'queryNotifyByType failed',
        data: null
      }
    }
  }

  @Get('queryMyNotifyByType')
  async queryMyNotifyByType(
    @Req() req: AuthReq,
    @Query('notifyType') notifyType: string,
    @Query('userId') userId?: string
  ) {
    try {
      const uid = this.resolveUserId(req, userId)
      if (!uid) {
        return { status: false, msg: 'userId is required', data: null }
      }
      const data = await Notify.queryMyNotifyByType(notifyType, uid)
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg:
          error instanceof Error ? error.message : 'queryMyNotifyByType failed',
        data: null
      }
    }
  }

  @Get('queryAllNotify')
  async queryAllNotify() {
    try {
      const data = await Notify.queryAllNotify()
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'queryAllNotify failed',
        data: null
      }
    }
  }

  @Get('queryMyAllNotify')
  async queryMyAllNotify(
    @Req() req: AuthReq,
    @Query('userId') userId?: string,
    @Query('status') status?: 'all' | 'read' | 'unread',
    @Query('curPage') curPage?: string,
    @Query('pageSize') pageSize?: string
  ) {
    try {
      const uid = this.resolveUserId(req, userId)
      if (!uid) {
        return { status: false, msg: 'userId is required', data: null }
      }
      const data = await Notify.queryMyAllNotify({
        userId: uid,
        status: status || 'all',
        curPage,
        pageSize
      })
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'queryMyAllNotify failed',
        data: null
      }
    }
  }

  @Get('unreadCount')
  async unreadCount(@Req() req: AuthReq, @Query('userId') userId?: string) {
    try {
      const uid = this.resolveUserId(req, userId)
      if (!uid) {
        return { status: false, msg: 'userId is required', data: null }
      }
      const count = await Notify.getUnreadCount(uid)
      return { status: true, msg: 'success', data: { count } }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'unreadCount failed',
        data: null
      }
    }
  }

  @Post('markRead')
  async markRead(
    @Req() req: AuthReq,
    @Body()
    body: { id?: string | number; notifyId?: string | number; userId?: string }
  ) {
    try {
      const uid = this.resolveUserId(req, body.userId)
      const notifyId = body.id ?? body.notifyId
      if (!uid || notifyId == null) {
        return { status: false, msg: 'id and userId are required', data: null }
      }
      const ok = await Notify.markRead(notifyId, uid)
      return {
        status: ok,
        msg: ok ? 'success' : 'notify not found',
        data: ok
      }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'markRead failed',
        data: null
      }
    }
  }

  @Post('markAllRead')
  async markAllRead(
    @Req() req: AuthReq,
    @Body() body: { userId?: string } = {}
  ) {
    try {
      const uid = this.resolveUserId(req, body.userId)
      if (!uid) {
        return { status: false, msg: 'userId is required', data: null }
      }
      const count = await Notify.markAllRead(uid)
      return { status: true, msg: 'success', data: { count } }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'markAllRead failed',
        data: null
      }
    }
  }

  @Post('sendNotify')
  async sendNotify(
    @Req() req: AuthReq,
    @Body()
    body: {
      sendId?: string | number
      receiveId?: string | number
      receiveIds?: Array<string | number>
      notifyType?: string
      notifyMsg?: string
      content?: string
    }
  ) {
    try {
      const sendId =
        body.sendId != null
          ? String(body.sendId)
          : this.resolveUserId(req) || '0'
      const receiveIds =
        body.receiveIds || (body.receiveId != null ? [body.receiveId] : [])
      const notifyMsg = body.notifyMsg || body.content || ''
      if (!receiveIds.length || !notifyMsg) {
        return {
          status: false,
          msg: 'receiveIds and notifyMsg are required',
          data: null
        }
      }
      const data = await Notify.sendNotifyToUsers({
        sendId,
        receiveIds,
        notifyType: body.notifyType || 'system',
        notifyMsg
      })
      return { status: true, msg: 'success', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : 'sendNotify failed',
        data: null
      }
    }
  }
}
