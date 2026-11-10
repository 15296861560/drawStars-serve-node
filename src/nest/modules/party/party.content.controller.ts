/**
 * UGC 治理控制器（PRD 8.4 内容审核 + 举报通道）：
 * - POST /party/security/msg-check：文本安全检测（微信 msgSecCheck）
 * - POST /party/report：用户提交举报（写入 party_report，运营后台审核闭环）
 *
 * 鉴权：@Public 免鉴权，clientKey 由 resolveClientKey 解析（tk_/dk_/ip_ 三级）。
 * 回包：{ pass, label? } / { ok, id? }，HTTP 恒 200。
 */
import { Body, Controller, Post, Req } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RawResponse } from '../../common/decorators/raw-response.decorator'
import { PartyContentService } from './party.content.service'
import { PartyRequestLike, resolveClientKey } from './party.util'

@Public()
@RawResponse()
@Controller('party')
export class PartyContentController {
  constructor(private readonly contentService: PartyContentService) {}

  /** 文本安全检测（微信 msgSecCheck 通道） */
  @Post('security/msg-check')
  async msgCheck(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    const text = typeof body?.text === 'string' ? body.text : ''
    const scene = typeof body?.scene === 'string' ? body.scene : 'text'
    return this.contentService.msgSecCheck(text, scene)
  }

  /** 用户提交举报（运营后台 /party/admin/reports 审核闭环） */
  @Post('report')
  async report(@Body() body: Record<string, unknown>, @Req() request: PartyRequestLike) {
    return this.contentService.submitReport(body, resolveClientKey(request))
  }
}
