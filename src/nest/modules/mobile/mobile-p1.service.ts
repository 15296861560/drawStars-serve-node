import { Injectable } from '@nestjs/common'
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign
} from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { RbacService } from '../rbac/rbac.service'

type PreviewGrant = {
  moduleCode: string
  moduleUrl: string
  name?: string
  expireAt: number
}

const previewMemory = new Map<string, PreviewGrant>()
const feedbackDedup = new Map<string, number>()

let packageKeyPair: { publicKey: string; privateKey: string } | null = null

function ensureKeys() {
  if (packageKeyPair) return packageKeyPair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  packageKeyPair = {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  }
  return packageKeyPair
}

function parseList(raw?: string | null) {
  if (!raw) return []
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

@Injectable()
export class MobileP1Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService
  ) {
    ensureKeys()
  }

  /** Until prisma generate picks new models on locked Windows hosts. */
  private get db(): any {
    return this.prisma.client as any
  }

  private async userPerms(userId?: number) {
    if (!userId) {
      return {
        roles: [] as string[],
        permissions: [] as string[],
        isSuper: false
      }
    }
    try {
      const data: any = await this.rbacService.getUserPermissions(userId)
      const payload = data?.data ?? data
      const roles = payload?.roles || []
      const permissions = payload?.permissions || []
      const isSuper =
        roles.includes('super_admin') ||
        permissions.includes('*') ||
        permissions.includes('super_admin')
      return { roles, permissions, isSuper }
    } catch {
      return { roles: [], permissions: [], isSuper: false }
    }
  }

  async search(userId: number | undefined, q: string) {
    const keyword = String(q || '').trim()
    if (!keyword) {
      return {
        status: true,
        msg: 'ok',
        data: { modules: [], menus: [], messages: [] }
      }
    }
    const { permissions, isSuper } = await this.userPerms(userId)
    const mods = await this.db.mobileModule.findMany({
      where: {
        status: 'published',
        OR: [
          { name: { contains: keyword } },
          { moduleCode: { contains: keyword } },
          { description: { contains: keyword } }
        ]
      },
      take: 20
    })
    const modules: Array<{
      moduleCode: string
      name: string
      version: string | null
    }> = []
    for (const m of mods) {
      const perms = await this.db.mobileModulePermission.findMany({
        where: { moduleCode: m.moduleCode }
      })
      const codes = perms.map(p => p.permissionCode)
      const allow =
        isSuper || !codes.length || codes.some(c => permissions.includes(c))
      if (!allow) continue
      modules.push({
        moduleCode: m.moduleCode,
        name: m.name,
        version: m.latestVersion
      })
    }

    // menus: best-effort from sys_menu if model exists
    let menus: any[] = []
    try {
      const rows = await (this.prisma.client as any).sysMenu?.findMany?.({
        where: {
          OR: [{ name: { contains: keyword } }, { path: { contains: keyword } }]
        },
        take: 20
      })
      menus = (rows || [])
        .filter(
          (r: any) => !r.client || r.client === 'mobile' || r.client === 'all'
        )
        .map((r: any) => ({
          name: r.name || r.menuName,
          path: r.path,
          moduleCode: r.moduleCode,
          client: r.client
        }))
    } catch {
      menus = []
    }

    let messages: any[] = []
    try {
      const rows = await (this.prisma.client as any).notify?.findMany?.({
        where: {
          OR: [
            { title: { contains: keyword } },
            { content: { contains: keyword } }
          ]
        },
        take: 20
      })
      messages = (rows || []).map((r: any) => ({
        id: Number(r.id),
        title: r.title,
        link: r.link || r.url
      }))
    } catch {
      messages = []
    }

    return {
      status: true,
      msg: 'ok',
      data: { modules, menus, messages }
    }
  }

  async submitFeedback(
    userId: number | undefined,
    body: { content?: string; contact?: string; diagnostics?: unknown }
  ) {
    const content = String(body?.content || '').trim()
    if (!content) return { status: false, msg: 'CONTENT_REQUIRED', data: null }
    const dedupKey =
      String(userId || 0) +
      ':' +
      createHash('sha1').update(content).digest('hex')
    const last = feedbackDedup.get(dedupKey) || 0
    if (Date.now() - last < 5000) {
      return { status: false, msg: '请勿重复提交', data: null }
    }
    feedbackDedup.set(dedupKey, Date.now())
    const now = Date.now()
    try {
      await this.db.mobileFeedback.create({
        data: {
          userId: userId != null ? BigInt(userId) : null,
          content,
          contact: body.contact || null,
          diagnosticsJson: body.diagnostics
            ? JSON.stringify(body.diagnostics)
            : null,
          status: 'open',
          createTime: BigInt(now)
        }
      })
    } catch (e: any) {
      // table may not exist yet — still accept
      console.warn('[feedback]', e?.message || e)
    }
    return { status: true, msg: 'ok', data: true }
  }

  async listFaq() {
    try {
      const rows = await this.db.mobileFaq.findMany({
        where: { status: 'published' },
        orderBy: { sort: 'asc' }
      })
      if (rows.length) {
        return {
          status: true,
          msg: 'ok',
          data: {
            list: rows.map(r => ({
              id: Number(r.id),
              question: r.question,
              answer: r.answer
            }))
          }
        }
      }
    } catch {
      /* fallback */
    }
    return {
      status: true,
      msg: 'ok',
      data: {
        list: [
          {
            id: 1,
            question: '如何添加模块？',
            answer: '打开应用中心，选择模块后安装或添加。'
          },
          {
            id: 2,
            question: '强制更新无法关闭？',
            answer: '壳或模块处于强制更新时需完成升级后才能继续使用。'
          }
        ]
      }
    }
  }

  async listBanners(platform?: string, userId?: number) {
    const { roles, isSuper } = await this.userPerms(userId)
    try {
      const rows = await this.db.mobileOpsBanner.findMany({
        where: { status: 'published' },
        orderBy: { sort: 'asc' }
      })
      const list = rows
        .filter(r => {
          const plats = parseList(r.platforms)
          if (plats.length && platform) {
            const p = platform.toLowerCase()
            const ok = plats.some(
              x =>
                x.toLowerCase() === p ||
                (p === 'web' && x.toLowerCase() === 'h5')
            )
            if (!ok) return false
          }
          const needRoles = parseList(r.roleCodes)
          if (!needRoles.length || isSuper) return true
          return needRoles.some(x => roles.includes(x))
        })
        .map(r => ({
          id: Number(r.id),
          title: r.title,
          imageUrl: r.imageUrl,
          link: r.link
        }))
      return { status: true, msg: 'ok', data: { list } }
    } catch {
      return { status: true, msg: 'ok', data: { list: [] } }
    }
  }

  async upsertBanner(body: Record<string, unknown>) {
    const now = Date.now()
    const data = {
      title: String(body.title || ''),
      imageUrl: (body.imageUrl || body.image_url || null) as string | null,
      link: (body.link as string) || null,
      platforms: Array.isArray(body.platforms)
        ? (body.platforms as string[]).join(',')
        : (body.platforms as string) || null,
      roleCodes: Array.isArray(body.roleCodes)
        ? (body.roleCodes as string[]).join(',')
        : ((body.role_codes || body.roleCodes || null) as string | null),
      sort: Number(body.sort || 0),
      status: String(body.status || 'published'),
      createTime: BigInt(now)
    }
    if (!data.title) return { status: false, msg: 'TITLE_REQUIRED', data: null }
    if (body.id) {
      const row = await this.db.mobileOpsBanner.update({
        where: { id: BigInt(Number(body.id)) },
        data: {
          title: data.title,
          imageUrl: data.imageUrl,
          link: data.link,
          platforms: data.platforms,
          roleCodes: data.roleCodes,
          sort: data.sort,
          status: data.status
        }
      })
      return { status: true, msg: 'ok', data: { id: Number(row.id) } }
    }
    const row = await this.db.mobileOpsBanner.create({ data })
    return { status: true, msg: 'ok', data: { id: Number(row.id) } }
  }

  async listBannersAdmin() {
    const rows = await this.db.mobileOpsBanner.findMany({
      orderBy: { sort: 'asc' }
    })
    return {
      status: true,
      msg: 'ok',
      data: {
        list: rows.map(r => ({
          id: Number(r.id),
          title: r.title,
          imageUrl: r.imageUrl,
          link: r.link,
          platforms: r.platforms,
          roleCodes: r.roleCodes,
          sort: r.sort,
          status: r.status
        }))
      }
    }
  }

  async createPreview(
    body: {
      moduleCode?: string
      moduleUrl?: string
      name?: string
      ttlSec?: number
    },
    userId?: number
  ) {
    const moduleCode = String(body.moduleCode || 'preview')
    const moduleUrl = String(body.moduleUrl || '').trim()
    if (!moduleUrl)
      return { status: false, msg: 'MODULE_URL_REQUIRED', data: null }
    const token = 'pv_' + randomBytes(12).toString('hex')
    const expireAt = Date.now() + (Number(body.ttlSec) || 3600) * 1000
    previewMemory.set(token, {
      moduleCode,
      moduleUrl,
      name: body.name,
      expireAt
    })
    try {
      await this.db.mobilePreviewToken.create({
        data: {
          token,
          moduleCode,
          moduleUrl,
          name: body.name || null,
          expireAt: BigInt(expireAt),
          createBy: userId != null ? BigInt(userId) : null
        }
      })
    } catch {
      /* memory ok */
    }
    return {
      status: true,
      msg: 'ok',
      data: {
        token,
        expireAt,
        deeplink: 'ds://preview/' + token,
        text: 'ds://preview/' + token
      }
    }
  }

  async resolvePreview(token?: string) {
    if (!token) return { status: false, msg: 'TOKEN_REQUIRED', data: null }
    let grant = previewMemory.get(token)
    if (!grant) {
      try {
        const row = await this.db.mobilePreviewToken.findUnique({
          where: { token }
        })
        if (row) {
          grant = {
            moduleCode: row.moduleCode,
            moduleUrl: row.moduleUrl,
            name: row.name || undefined,
            expireAt: Number(row.expireAt)
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!grant || grant.expireAt < Date.now()) {
      return { status: false, msg: 'PREVIEW_EXPIRED', data: null }
    }
    return {
      status: true,
      msg: 'ok',
      data: {
        moduleCode: grant.moduleCode,
        moduleUrl: grant.moduleUrl,
        name: grant.name || grant.moduleCode
      }
    }
  }

  async listDebugWhitelist() {
    try {
      const rows = await this.db.mobileDebugWhitelist.findMany({
        where: { status: 1 }
      })
      return {
        status: true,
        msg: 'ok',
        data: {
          list: rows.map(r => ({
            id: Number(r.id),
            pattern: r.pattern,
            remark: r.remark
          }))
        }
      }
    } catch {
      return { status: true, msg: 'ok', data: { list: [] } }
    }
  }

  async addDebugWhitelist(body: { pattern?: string; remark?: string }) {
    const pattern = String(body.pattern || '').trim()
    if (!pattern) return { status: false, msg: 'PATTERN_REQUIRED', data: null }
    const row = await this.db.mobileDebugWhitelist.create({
      data: {
        pattern,
        remark: body.remark || null,
        status: 1,
        createTime: BigInt(Date.now())
      }
    })
    return { status: true, msg: 'ok', data: { id: Number(row.id) } }
  }

  async checkDebugUrl(url?: string) {
    const u = String(url || '').trim()
    if (!u)
      return { status: false, msg: 'URL_REQUIRED', data: { allow: false } }
    // allow same-origin relative
    if (u.startsWith('/')) {
      return { status: true, msg: 'ok', data: { allow: true } }
    }
    let list: string[] = []
    try {
      const rows = await this.db.mobileDebugWhitelist.findMany({
        where: { status: 1 }
      })
      list = rows.map(r => r.pattern)
    } catch {
      list = ['localhost', '127.0.0.1', 'example.com']
    }
    if (!list.length) list = ['localhost', '127.0.0.1']
    const allow = list.some(p => u.includes(p))
    return {
      status: true,
      msg: allow ? 'ok' : 'NOT_WHITELISTED',
      data: { allow }
    }
  }

  getPackagePublicKey() {
    const keys = ensureKeys()
    return {
      status: true,
      msg: 'ok',
      data: { publicKey: keys.publicKey, alg: 'ed25519' }
    }
  }

  /** Sign checksum hex with platform private key (for publish pipeline). */
  signChecksum(checksum?: string) {
    const hex = String(checksum || '')
      .replace(/^sha256:/i, '')
      .trim()
      .toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(hex)) {
      return { status: false, msg: 'CHECKSUM_INVALID', data: null }
    }
    const keys = ensureKeys()
    const sig = cryptoSign(
      null,
      Buffer.from(hex, 'hex'),
      createPrivateKey(keys.privateKey)
    )
    return {
      status: true,
      msg: 'ok',
      data: { signature: Buffer.from(sig).toString('hex'), alg: 'ed25519' }
    }
  }

  async registerPush(
    userId: number | undefined,
    body: {
      token?: string
      channel?: string
      platform?: string
      shellVersion?: string
    }
  ) {
    const token = String(body.token || '').trim()
    if (!token) return { status: false, msg: 'TOKEN_REQUIRED', data: null }
    const now = Date.now()
    try {
      if (userId != null) {
        await this.db.mobilePushDevice.upsert({
          where: {
            userId_token: { userId: BigInt(userId), token }
          },
          create: {
            userId: BigInt(userId),
            token,
            channel: body.channel || null,
            platform: body.platform || null,
            shellVersion: body.shellVersion || null,
            updateTime: BigInt(now)
          },
          update: {
            channel: body.channel || null,
            platform: body.platform || null,
            shellVersion: body.shellVersion || null,
            updateTime: BigInt(now)
          }
        })
      }
    } catch (e: any) {
      console.warn('[push-register]', e?.message || e)
    }
    return { status: true, msg: 'ok', data: true }
  }

  async getPushPrefs(userId?: number) {
    if (userId == null) {
      return {
        status: true,
        msg: 'ok',
        data: { enable: true, categories: { system: true, app: true } }
      }
    }
    try {
      const row = await this.db.mobilePushPref.findUnique({
        where: { userId: BigInt(userId) }
      })
      if (!row) {
        return {
          status: true,
          msg: 'ok',
          data: { enable: true, categories: { system: true, app: true } }
        }
      }
      let categories = { system: true, app: true }
      try {
        categories = JSON.parse(row.categories || '{}')
      } catch {
        /* default */
      }
      return {
        status: true,
        msg: 'ok',
        data: { enable: row.enable !== 0, categories }
      }
    } catch {
      return {
        status: true,
        msg: 'ok',
        data: { enable: true, categories: { system: true, app: true } }
      }
    }
  }

  async setPushPrefs(
    userId: number | undefined,
    body: { enable?: boolean; categories?: Record<string, boolean> }
  ) {
    if (userId == null)
      return { status: false, msg: 'LOGIN_REQUIRED', data: null }
    const now = Date.now()
    try {
      await this.db.mobilePushPref.upsert({
        where: { userId: BigInt(userId) },
        create: {
          userId: BigInt(userId),
          enable: body.enable === false ? 0 : 1,
          categories: JSON.stringify(body.categories || {}),
          updateTime: BigInt(now)
        },
        update: {
          enable: body.enable === false ? 0 : 1,
          categories: JSON.stringify(body.categories || {}),
          updateTime: BigInt(now)
        }
      })
    } catch (e: any) {
      console.warn('[push-prefs]', e?.message || e)
    }
    return { status: true, msg: 'ok', data: true }
  }
}
