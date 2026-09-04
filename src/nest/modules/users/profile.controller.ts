import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common'
import fs from 'fs'
import path from 'path'
import { Formidable } from 'formidable'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { UsersService } from './users.service'

@Controller('profileApi')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  private resolveId(
    req: {
      headers?: Record<string, unknown>
      query?: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    bodyId?: number | string
  ) {
    return this.usersService.resolveUserId(req, bodyId)
  }

  @Get('queryUserInfo')
  async queryUserInfo(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Query('id') id?: string
  ) {
    const userId = this.resolveId(req, id)
    if (!userId) {
      return { status: false, msg: '缺少用户 id', data: null }
    }
    const data = await this.usersService.queryUserInfo(userId)
    return { status: true, msg: 'ok', data }
  }

  @Post('updateUserInfo')
  async updateUserInfo(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      name?: string
      introduction?: string
      birthday?: string
      region?: string
      gender?: string
      accountAlias?: string
      avatar?: string
    }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.updateUserInfo(userId, {
        name: body.name,
        introduction: body.introduction,
        birthday: body.birthday,
        region: body.region,
        gender: body.gender,
        accountAlias: body.accountAlias,
        avatar: body.avatar
      })
      return { status: true, msg: '修改成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: '修改失败',
        data: error instanceof Error ? error.message : String(error)
      }
    }
  }

  @Post('uploadAvatar')
  @RawResponse()
  uploadAvatar(@Req() req: unknown, @Res() res: unknown) {
    const request = req as import('express').Request & {
      auth?: { uid?: string }
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
    }
    const response = res as import('express').Response
    const form = new Formidable({
      uploadDir: this.usersService.getUploadDir(),
      keepExtensions: true,
      maxFieldsSize: 5 * 1024 * 1024
    })

    form.parse(request, async (err, fields, files) => {
      if (err) {
        response
          .status(500)
          .json({ status: false, msg: String(err), data: null })
        return
      }
      try {
        const bodyId = fields.id?.[0]
        const userId = this.resolveId(request, bodyId)
        if (!userId) {
          response
            .status(400)
            .json({ status: false, msg: '缺少用户 id', data: null })
          return
        }
        const orgName = fields.filename?.[0] as string
        const oldpath = files.file?.[0]?.filepath
        if (!oldpath) {
          response
            .status(400)
            .json({ status: false, msg: '缺少文件', data: null })
          return
        }
        const newName = `avatar_${userId}_${Date.now()}_${orgName || 'img.png'}`
        const newpath = path.join(this.usersService.getUploadDir(), newName)
        fs.renameSync(oldpath, newpath)
        const avatarUrl = `/uploadImg/${newName}`
        await this.usersService.setAvatar(userId, avatarUrl)
        response.status(200).json({
          status: true,
          msg: '上传成功',
          data: { url: avatarUrl }
        })
      } catch (error) {
        response.status(500).json({
          status: false,
          msg: error instanceof Error ? error.message : String(error),
          data: null
        })
      }
    })
  }

  @Post('deleteAvatar')
  async deleteAvatar(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.setAvatar(userId, null)
      return { status: true, msg: '已删除头像', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('changePassword')
  async changePassword(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; password: string; newPassword: string }
  ) {
    const userId = this.resolveId(req, body.id)
    if (!userId) {
      return { status: false, msg: '缺少用户 id', data: null }
    }
    const ok = await this.usersService.changePassword(
      userId,
      body.password,
      body.newPassword
    )
    if (!ok) {
      return { status: false, msg: '校验失败', data: '密码错误' }
    }
    return { status: true, msg: '修改成功', data: null }
  }

  @Post('getCaptcha')
  async getCaptcha(@Body() body: { account: string; type?: string }) {
    try {
      if (!body.account) {
        return { status: false, msg: '缺少账号', data: null }
      }
      const result = await this.usersService.getCaptcha(
        body.account,
        body.type || 'login'
      )
      return {
        status: !!result.ok,
        msg: 'ok',
        data: {
          channel: result.channel,
          captcha: result.captcha,
          warning: (result as { warning?: string }).warning || null
        }
      }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('verifyCaptcha')
  async verifyCaptcha(
    @Body()
    body: {
      account?: string
      phone?: string
      captcha: string
      type?: string
    }
  ) {
    const account = body.account || body.phone
    if (!account) {
      return { status: false, msg: '缺少账号', data: null }
    }
    const ok = await this.usersService.verifyCaptcha(
      account,
      body.captcha,
      body.type || 'login'
    )
    return { status: ok, msg: ok ? 'ok' : '验证码错误', data: null }
  }

  @Post('changePhone')
  async changePhone(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      phone?: string
      oldCaptcha?: string
      newCaptcha?: string
      unbind?: boolean
    }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.changePhone(userId, body)
      return { status: true, msg: '修改成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('bindEmail')
  async bindEmail(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      email?: string
      oldCaptcha?: string
      newCaptcha?: string
      unbind?: boolean
    }
  ) {
    return this.changeEmail(req, body)
  }

  @Post('changeEmail')
  async changeEmail(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      email?: string
      oldCaptcha?: string
      newCaptcha?: string
      unbind?: boolean
    }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.changeEmail(userId, body)
      return { status: true, msg: '修改成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('unbindEmail')
  async unbindEmail(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; oldCaptcha?: string }
  ) {
    return this.changeEmail(req, { ...body, unbind: true })
  }

  @Post('unbindPhone')
  async unbindPhone(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; oldCaptcha?: string }
  ) {
    return this.changePhone(req, { ...body, unbind: true })
  }

  @Public()
  @Post('resetPassword')
  async resetPassword(
    @Body() body: { account: string; captcha: string; newPassword: string }
  ) {
    try {
      await this.usersService.resetPassword(body)
      return { status: true, msg: '密码重置成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('updateLoginPrefs')
  async updateLoginPrefs(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      smsLoginEnabled?: boolean
      oauthLoginEnabled?: boolean
    }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.updateLoginPrefs(userId, body)
      return { status: true, msg: '保存成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('listOauthBinds')
  async listOauthBinds(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Query('id') id?: string
  ) {
    const userId = this.resolveId(req, id)
    if (!userId) {
      return { status: false, msg: '缺少用户 id', data: null }
    }
    const data = await this.usersService.listOauthBinds(userId)
    return { status: true, msg: 'ok', data }
  }

  @Get('oauthBind/:platform')
  async oauthBind(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Param('platform') platform: string,
    @Query('id') id?: string
  ) {
    const userId = this.resolveId(req, id)
    if (!userId) {
      return { status: false, msg: '缺少用户 id', data: null }
    }
    const data = await this.usersService.getOauthAuthorizeInfo(platform, userId)
    if (!data.available) {
      return {
        status: false,
        msg: '该第三方登录暂不可用',
        data: { available: false, platform }
      }
    }
    return { status: true, msg: 'ok', data: { ...data, platform } }
  }

  @Post('oauthUnbind')
  async oauthUnbind(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; platform: string }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.oauthUnbind(userId, body.platform)
      return { status: true, msg: '解绑成功', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('notifyPrefs')
  async getNotifyPrefs(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Query('id') id?: string
  ) {
    const userId = this.resolveId(req, id)
    if (!userId) {
      return { status: false, msg: '缺少用户 id', data: null }
    }
    const data = await this.usersService.getOrCreateNotifyPrefs(userId)
    return { status: true, msg: 'ok', data }
  }

  @Post('notifyPrefs')
  async updateNotifyPrefs(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body()
    body: {
      id?: number
      inApp?: boolean
      sms?: boolean
      email?: boolean
      websocket?: boolean
    }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      const data = await this.usersService.updateNotifyPrefs(userId, body)
      return { status: true, msg: '保存成功', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('myRoles')
  async myRoles(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Query('id') id?: string
  ) {
    try {
      const userId = this.resolveId(req, id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      const data = await this.usersService.myRoles(userId)
      return { status: true, msg: 'ok', data }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('deactivateAccount')
  async deactivateAccount(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; password: string }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.deactivateAccount(userId, body.password)
      return { status: true, msg: '账号已停用', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('deleteAccount')
  async deleteAccount(
    @Req()
    req: {
      headers: Record<string, unknown>
      query: Record<string, unknown>
      cookies?: Record<string, string>
      auth?: { uid?: string }
    },
    @Body() body: { id?: number; password: string }
  ) {
    try {
      const userId = this.resolveId(req, body.id)
      if (!userId) {
        return { status: false, msg: '缺少用户 id', data: null }
      }
      await this.usersService.deleteAccount(userId, body.password)
      return { status: true, msg: '账号已注销', data: null }
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }
}
