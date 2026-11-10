/**
 * UGC 治理服务（PRD 8.4 内容审核 + 8.7 合规）：
 * - msgSecCheck：对接微信 wxa/msg_sec_check，文本内容安全检测
 * - report：用户侧举报写入 party_report 表（pending 状态，运营后台审核闭环）
 *
 * WeChat access_token 缓存在 Redis（key=party:wx_access_token，TTL 7000s），
 * 避免每次审核都拉 token；凭证缺失 / 微信接口失败时降级放行（不阻断体验）。
 */
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import redisClient from '../../../public/db/redis/client'
import wechatProvider from '../../../public/provider/oauth/wechatProvider'
import { PrismaService } from '../../prisma/prisma.service'
import { genId } from './party.util'

const TOKEN_KEY = 'party:wx_access_token'
const TOKEN_TTL = 7000 // 微信 7200s 过期，提前 200s 刷新
const WX_API_TIMEOUT = 5000

/** 前端 kind → 后端 targetType 映射（与 party_report.target_type 列口径对齐） */
const KIND_TO_TARGET: Record<string, string> = {
  wish: 'wish',
  session: 'session',
  name: 'name',
  content: 'content',
}

@Injectable()
export class PartyContentService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------- 内容安全检测（wxa/msg_sec_check） ---------- */

  /** 获取微信 access_token（Redis 缓存）；凭证缺失 / 拉取失败返回空串 */
  private async getAccessToken(): Promise<string> {
    try {
      const cached = await redisClient.get(TOKEN_KEY).catch(() => null)
      if (cached) return cached

      const { appId, secret } = await wechatProvider.getConfig('mp')
      const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
        params: {
          grant_type: 'client_credential',
          appid: appId,
          secret,
        },
        timeout: WX_API_TIMEOUT,
      })
      const data = (res.data || {}) as { access_token?: string; expires_in?: number; errcode?: number }
      if (!data.access_token || data.errcode) return ''

      await redisClient.set(TOKEN_KEY, data.access_token).catch(() => {})
      await redisClient.expire(TOKEN_KEY, TOKEN_TTL).catch(() => {})
      return data.access_token
    } catch {
      return ''
    }
  }

  /**
   * 文本安全检测
   * @returns { pass: boolean, label?: string }
   *  - 微信返回 errcode=0 → pass:true
   *  - 微信返回 87014（内容违规）→ pass:false, label:'risky'
   *  - 凭证缺失 / 接口异常 → pass:true（降级放行，不阻断体验）
   */
  async msgSecCheck(text: string, scene?: string): Promise<{ pass: boolean; label?: string }> {
    const content = String(text || '').trim()
    if (!content) return { pass: true }
    // 超长文本截断（msg_sec_check 上限 500KB，这里保守到 1000 字符）
    const payload = content.slice(0, 1000)

    const token = await this.getAccessToken()
    if (!token) return { pass: true } // 凭证未配置 → 放行

    try {
      const res = await axios.post(
        'https://api.weixin.qq.com/wxa/msg_sec_check',
        { content: payload },
        {
          params: { access_token: token },
          timeout: WX_API_TIMEOUT,
        }
      )
      const data = (res.data || {}) as { errcode?: number; errmsg?: string }
      // errcode=0 通过；87014 违规；其余错误码放行（避免误伤）
      if (data.errcode === 0) return { pass: true }
      if (data.errcode === 87014) return { pass: false, label: 'risky' }
      return { pass: true }
    } catch {
      return { pass: true } // 网络异常 → 放行
    }
  }

  /* ---------- 用户举报（写入 party_report，状态 pending） ---------- */

  /**
   * 用户提交举报
   * @param body { kind, targetId, sessionId?, reason, description?, at? }
   * @returns { ok: boolean, id?: string }
   */
  async submitReport(
    body: Record<string, unknown> | null | undefined,
    clientKey: string
  ): Promise<{ ok: boolean; id?: string }> {
    const r = body || {}
    const kind = this.str(r.kind, 32)
    const targetType = KIND_TO_TARGET[kind] || kind || 'content'
    const targetId = this.str(r.targetId, 64)
    if (!targetId) return { ok: false }

    const reason = this.str(r.reason, 32) || 'other'
    const description = this.str(r.description, 512)
    const sessionId = this.str(r.sessionId, 32) || null

    const created = await this.prisma.client.partyReport.create({
      data: {
        id: genId(),
        targetType,
        targetId,
        sessionId,
        reason,
        description: description ? `${description} (reporter:${clientKey})` : `reporter:${clientKey}`,
        status: 'pending',
      },
    })
    return { ok: true, id: created.id }
  }

  /* ---------- 工具 ---------- */
  private str(v: unknown, max: number, fallback = ''): string {
    if (typeof v !== 'string') return fallback
    const s = v.trim()
    return s.length <= max ? s : s.slice(0, max)
  }
}
