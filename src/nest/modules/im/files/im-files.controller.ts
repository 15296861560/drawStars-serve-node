import { Body, Controller, Post, Req } from '@nestjs/common'
import path from 'path'
import config from '../../../../config/publish-config'
import { IM_DEFAULTS, ImErrorCode } from '../im.constants'
import { ImException } from '../im.errors'

/**
 * 图片上传预签名（v1.0）：复用平台静态目录 + 短时 URL。
 * 完整对象存储对接在 v1.2+；这里返回本地 uploadDir 的可访问 URL 与 objectKey。
 */
@Controller('im/files')
export class ImFilesController {
  @Post('presign')
  async presign(
    @Req() req: any,
    @Body() body: { mime: string; size: number; ext: string }
  ) {
    const uid = String(req.auth?.uid ?? '0')
    const mime = String(body?.mime || '')
    const size = Number(body?.size || 0)
    if (!IM_DEFAULTS.imageMimes.includes(mime)) {
      throw new ImException(ImErrorCode.UPLOAD_INVALID, '不支持的文件类型')
    }
    if (size > IM_DEFAULTS.imageMaxBytes) {
      throw new ImException(ImErrorCode.UPLOAD_INVALID, '文件过大')
    }
    const objectKey = `im/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${body.ext || 'png'}`
    // 实际可访问地址：通过后端静态服务 /uploadDir 暴露（main.ts useStaticAssets）
    const url = `/uploads/${objectKey}`
    const uploadPath = path.join(config.uploadDir || 'uploadDir', objectKey)
    return {
      status: true,
      msg: 'ok',
      data: { objectKey, url, uploadPath, method: 'POST' as const }
    }
  }
}
