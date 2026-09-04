import { Injectable } from '@nestjs/common'
import { createHmac, randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { serializeBigInt } from '../../../lib/serialize'
import { RbacService } from '../rbac/rbac.service'

type DownloadGrant = {
  moduleCode: string
  fileUrl: string
  checksum: string
  version: string
  expireAt: number
}

const downloadGrants = new Map<string, DownloadGrant>()

function parsePlatforms(raw?: string | null): string[] {
  if (!raw) return []
  try {
    if (raw.trim().startsWith('[')) {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr.map(String) : []
    }
  } catch {
    /* csv */
  }
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function platformMatches(platforms: string[], platform?: string) {
  if (!platform) return true
  const p = platform.toLowerCase()
  if (p === 'web') return platforms.some(x => x.toLowerCase() === 'h5')
  return platforms.some(x => x.toLowerCase() === p)
}

function isAppPlatform(platform?: string) {
  const p = String(platform || '').toLowerCase()
  return p === 'android' || p === 'ios' || p === 'app' || p === 'app-plus'
}

function compareSemver(a?: string | null, b?: string | null): number {
  const parse = (v?: string | null) =>
    String(v || '0.0.0')
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map(n => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

function isHttpsUrl(url?: string | null) {
  return /^https:\/\//i.test(String(url || '').trim())
}

function needsOnlineUrl(platforms: string[]) {
  return platforms.some(p =>
    ['h5', 'mp-weixin', 'mp', 'mini'].includes(p.toLowerCase())
  )
}

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService
  ) {}

  private async permsOf(moduleCode: string) {
    const rows = await this.prisma.client.mobileModulePermission.findMany({
      where: { moduleCode }
    })
    return rows.map(r => r.permissionCode)
  }

  private toModuleDto(
    row: {
      moduleCode: string
      name: string
      description: string | null
      icon: string | null
      category: string | null
      platforms: string | null
      status: string | null
      latestVersion: string | null
      moduleUrl: string | null
    },
    extra: Record<string, unknown> = {}
  ) {
    return serializeBigInt({
      moduleCode: row.moduleCode,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category,
      platforms: parsePlatforms(row.platforms),
      status: row.status,
      version: row.latestVersion,
      moduleUrl: row.moduleUrl,
      ...extra
    })
  }

  async listModules(query: {
    platform?: string
    category?: string
    keyword?: string
  }) {
    const rows = await this.prisma.client.mobileModule.findMany({
      where: {
        status: 'published',
        ...(query.category ? { category: query.category } : {}),
        ...(query.keyword
          ? {
              OR: [
                { name: { contains: query.keyword } },
                { moduleCode: { contains: query.keyword } }
              ]
            }
          : {})
      },
      orderBy: { updateTime: 'desc' }
    })
    const list: Array<Record<string, unknown>> = []
    for (const row of rows) {
      const platforms = parsePlatforms(row.platforms)
      if (!platformMatches(platforms, query.platform)) continue
      const permissionCodes = await this.permsOf(row.moduleCode)
      list.push(this.toModuleDto(row, { permissionCodes }))
    }
    return { status: true, msg: 'ok', data: { list, total: list.length } }
  }

  async moduleDetail(code: string) {
    const row = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode: code }
    })
    if (!row) {
      return { status: false, msg: 'MODULE_NOT_FOUND', data: null }
    }
    if (row.status === 'offline') {
      return { status: false, msg: 'MODULE_OFFLINE', data: null }
    }
    if (row.status !== 'published') {
      return { status: false, msg: 'MODULE_NOT_FOUND', data: null }
    }
    const ver = await this.prisma.client.mobileModuleVersion.findFirst({
      where: { moduleCode: code, version: row.latestVersion || undefined },
      orderBy: { createTime: 'desc' }
    })
    const permissionCodes = await this.permsOf(code)
    return {
      status: true,
      msg: 'ok',
      data: this.toModuleDto(row, {
        permissionCodes,
        releaseNotes: ver?.releaseNotes || '',
        forceUpdate: !!ver?.forceUpdate,
        checksum: ver?.checksum || '',
        allowOpenAfterOffline: false
      })
    }
  }

  async openCheck(code: string, localVersion?: string, shellVersion?: string) {
    const row = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode: code }
    })
    if (!row) {
      return {
        status: false,
        msg: 'MODULE_NOT_FOUND',
        data: { allow: false, reason: 'MODULE_NOT_FOUND' }
      }
    }
    if (row.status === 'offline') {
      return {
        status: false,
        msg: 'MODULE_OFFLINE',
        data: { allow: false, reason: 'MODULE_OFFLINE' }
      }
    }
    if (row.status !== 'published') {
      return {
        status: false,
        msg: 'MODULE_NOT_FOUND',
        data: { allow: false, reason: 'MODULE_NOT_FOUND' }
      }
    }

    // minShellVersion from app_manage if linked
    if (row.appManageId != null) {
      const app = await this.prisma.client.appManage.findUnique({
        where: { id: row.appManageId }
      })
      const minShell = app?.minShellVersion
      if (
        minShell &&
        shellVersion &&
        compareSemver(shellVersion, minShell) < 0
      ) {
        return {
          status: false,
          msg: 'SHELL_TOO_OLD',
          data: {
            allow: false,
            reason: 'SHELL_TOO_OLD',
            minShellVersion: minShell
          }
        }
      }
    }

    const ver = await this.prisma.client.mobileModuleVersion.findFirst({
      where: { moduleCode: code, version: row.latestVersion || undefined }
    })
    const forceUpdate = !!ver?.forceUpdate
    if (
      forceUpdate &&
      localVersion &&
      row.latestVersion &&
      compareSemver(row.latestVersion, localVersion) > 0
    ) {
      return {
        status: false,
        msg: 'MODULE_FORCE_UPDATE',
        data: {
          allow: false,
          reason: 'MODULE_FORCE_UPDATE',
          latestVersion: row.latestVersion,
          forceUpdate: true
        }
      }
    }
    return {
      status: true,
      msg: 'ok',
      data: {
        allow: true,
        reason: '',
        latestVersion: row.latestVersion,
        forceUpdate,
        status: row.status,
        bridgePermissions: []
      }
    }
  }

  async requestTicket(input: {
    userId?: number
    moduleCode: string
    platform?: string
  }) {
    if (!input.moduleCode) {
      return { status: false, msg: 'MODULE_CODE_REQUIRED', data: null }
    }
    const mod = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode: input.moduleCode }
    })
    if (!mod || mod.status !== 'published') {
      return { status: false, msg: 'MODULE_NOT_FOUND', data: null }
    }
    const ticket = 't_' + randomBytes(16).toString('hex')
    const expireAt = Date.now() + 120_000
    await this.prisma.client.mobileModuleTicket.create({
      data: {
        ticket,
        userId: input.userId != null ? BigInt(input.userId) : null,
        moduleCode: input.moduleCode,
        platform: input.platform || null,
        expireAt: BigInt(expireAt),
        used: 0
      }
    })
    return {
      status: true,
      msg: 'ok',
      data: { ticket, expireIn: 120 }
    }
  }

  async exchangeTicket(ticket: string) {
    if (!ticket) {
      return { status: false, msg: 'AUTH_TICKET_INVALID', data: null }
    }
    const row = await this.prisma.client.mobileModuleTicket.findUnique({
      where: { ticket }
    })
    if (!row || row.used || Number(row.expireAt) < Date.now()) {
      return { status: false, msg: 'AUTH_TICKET_INVALID', data: null }
    }
    await this.prisma.client.mobileModuleTicket.update({
      where: { ticket },
      data: { used: 1 }
    })
    const accessToken =
      'mod_' + randomBytes(24).toString('hex') + '_' + row.moduleCode
    return {
      status: true,
      msg: 'ok',
      data: {
        accessToken,
        moduleCode: row.moduleCode,
        expireIn: 1800
      }
    }
  }

  async download(code: string, platform?: string, userId?: number) {
    if (!isAppPlatform(platform)) {
      return {
        status: false,
        msg: 'download only for App',
        code: 403,
        data: null
      }
    }
    if (userId) {
      const { roleCodes, permissions } =
        await this.rbacService.getUserRoleAndPermissions(userId)
      if (!roleCodes.includes('super_admin')) {
        if (!permissions.includes('mobile:module:install')) {
          return {
            status: false,
            msg: 'NO_INSTALL_PERMISSION',
            code: 403,
            data: null
          }
        }
        const need = await this.permsOf(code)
        if (need.length && !need.some(p => permissions.includes(p))) {
          return {
            status: false,
            msg: 'MODULE_NO_PERMISSION',
            code: 403,
            data: null
          }
        }
      }
    }
    const mod = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode: code }
    })
    if (!mod || mod.status !== 'published') {
      return { status: false, msg: 'MODULE_NOT_FOUND', data: null }
    }
    const ver = await this.prisma.client.mobileModuleVersion.findFirst({
      where: { moduleCode: code, status: 'published' },
      orderBy: { createTime: 'desc' }
    })
    if (!ver?.filePath) {
      return { status: false, msg: 'PACKAGE_NOT_FOUND', data: null }
    }
    let fileUrl = ver.filePath
    try {
      const parsed = JSON.parse(ver.filePath)
      fileUrl = parsed.filePath || parsed.url || ver.filePath
    } catch {
      /* plain url */
    }
    const expireAt = Date.now() + 600_000
    const token = createHmac(
      'sha256',
      process.env.MOBILE_DOWNLOAD_SECRET || 'ds-mobile'
    )
      .update(code + ':' + expireAt + ':' + randomBytes(8).toString('hex'))
      .digest('hex')
      .slice(0, 48)
    downloadGrants.set(token, {
      moduleCode: code,
      fileUrl,
      checksum: ver.checksum || '',
      version: ver.version,
      expireAt
    })
    // Short-lived redeem URL (not the raw package path)
    const url = `/api/mobile/modules/${encodeURIComponent(code)}/package?token=${token}`
    return {
      status: true,
      msg: 'ok',
      data: {
        url,
        expireAt,
        checksum: ver.checksum || '',
        version: ver.version
      }
    }
  }

  async redeemPackage(code: string, token?: string) {
    if (!token) {
      return { status: false, msg: 'TOKEN_REQUIRED', code: 403, data: null }
    }
    const grant = downloadGrants.get(token)
    if (!grant || grant.moduleCode !== code || grant.expireAt < Date.now()) {
      downloadGrants.delete(token)
      return { status: false, msg: 'TOKEN_INVALID', code: 403, data: null }
    }
    // one-time
    downloadGrants.delete(token)
    return {
      status: true,
      msg: 'ok',
      data: {
        url: grant.fileUrl,
        checksum: grant.checksum,
        version: grant.version,
        expireAt: grant.expireAt
      }
    }
  }

  async checkModuleUpdate(code: string, version?: string) {
    const row = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode: code }
    })
    if (!row) return { status: false, msg: 'MODULE_NOT_FOUND', data: null }
    const hasUpdate = !!(
      version &&
      row.latestVersion &&
      version !== row.latestVersion
    )
    const ver = await this.prisma.client.mobileModuleVersion.findFirst({
      where: { moduleCode: code, version: row.latestVersion || undefined }
    })
    return {
      status: true,
      msg: 'ok',
      data: {
        hasUpdate,
        latestVersion: row.latestVersion,
        forceUpdate: !!ver?.forceUpdate,
        releaseNotes: ver?.releaseNotes || ''
      }
    }
  }

  async checkShellUpdate(query: {
    platform?: string
    channel?: string
    version?: string
    buildNumber?: string
  }) {
    const platform = String(query.platform || 'android').toLowerCase()
    const channel = query.channel || 'default'
    const row = await this.prisma.client.mobileShellRelease.findFirst({
      where: {
        platform: platform === 'web' ? 'h5' : platform,
        channel,
        status: 'published'
      },
      orderBy: { createTime: 'desc' }
    })
    if (!row) {
      return {
        status: true,
        msg: 'ok',
        data: {
          needUpdate: false,
          forceUpdate: false,
          latestVersion: query.version || '1.0.0'
        }
      }
    }
    const needUpdate =
      (!!query.version && query.version !== row.version) ||
      (!!query.buildNumber &&
        !!row.buildNumber &&
        query.buildNumber !== row.buildNumber)
    return {
      status: true,
      msg: 'ok',
      data: {
        needUpdate,
        forceUpdate: !!row.forceUpdate,
        latestVersion: row.version,
        buildNumber: row.buildNumber,
        packageUrl: row.packageUrl,
        downloadUrl: row.packageUrl,
        releaseNotes: row.releaseNotes
      }
    }
  }

  async reportTelemetry(events: unknown[]) {
    console.log(
      '[mobile-telemetry]',
      Array.isArray(events) ? events.length : 0,
      events
    )
    return { status: true, msg: 'ok', data: true }
  }

  async syncInstalled(
    userId: number | undefined,
    list: Array<{
      moduleCode: string
      version?: string
      platform?: string
      mode?: string
    }>
  ) {
    if (!userId || !Array.isArray(list)) {
      return { status: true, msg: 'ok', data: true }
    }
    const now = Date.now()
    for (const item of list) {
      if (!item.moduleCode) continue
      await this.prisma.client.userModuleInstall.upsert({
        where: {
          userId_moduleCode: {
            userId: BigInt(userId),
            moduleCode: item.moduleCode
          }
        },
        create: {
          userId: BigInt(userId),
          moduleCode: item.moduleCode,
          version: item.version || null,
          platform: item.platform || null,
          mode: item.mode || 'soft',
          updateTime: BigInt(now)
        },
        update: {
          version: item.version || null,
          platform: item.platform || null,
          mode: item.mode || 'soft',
          updateTime: BigInt(now)
        }
      })
    }
    return { status: true, msg: 'ok', data: true }
  }

  /** Publish gate + sync catalog from app_manage row */
  async publishFromAppManage(appId: number) {
    const app = await this.prisma.client.appManage.findUnique({
      where: { id: BigInt(appId) }
    })
    if (!app) return { status: false, msg: '应用不存在', data: null }

    const platforms = parsePlatforms(app.platforms)
    if (!platforms.length) {
      return { status: false, msg: '发布门禁：platforms 不能为空', data: null }
    }
    if (!app.version || !/^\d+\.\d+\.\d+/.test(app.version)) {
      return {
        status: false,
        msg: '发布门禁：version 需符合 SemVer (x.y.z)',
        data: null
      }
    }
    if (needsOnlineUrl(platforms)) {
      if (!app.moduleUrl) {
        return {
          status: false,
          msg: '发布门禁：含 h5/小程序必须填写 module_url',
          data: null
        }
      }
      if (
        !isHttpsUrl(app.moduleUrl) &&
        !String(app.moduleUrl).startsWith('/')
      ) {
        return {
          status: false,
          msg: '发布门禁：module_url 须为 https 或站内相对路径',
          data: null
        }
      }
    }
    const needZip = platforms.some(p =>
      ['android', 'ios', 'app'].includes(p.toLowerCase())
    )
    if (needZip && !app.filePath) {
      return {
        status: false,
        msg: '发布门禁：含 App 平台必须上传 zip',
        data: null
      }
    }
    if (needZip && !app.checksum) {
      return {
        status: false,
        msg: '发布门禁：含 App 平台必须填写 checksum',
        data: null
      }
    }
    if (needZip && app.checksum) {
      const hex = String(app.checksum).replace(/^sha256:/i, '')
      if (
        process.env.NODE_ENV === 'production' &&
        !/^[a-f0-9]{64}$/i.test(hex)
      ) {
        return {
          status: false,
          msg: '发布门禁：checksum 须为 sha256 十六进制',
          data: null
        }
      }
    }

    const moduleCode =
      app.moduleCode ||
      'app.' +
        String(app.name || 'mod')
          .replace(/\s+/g, '_')
          .toLowerCase()

    const existing = await this.prisma.client.mobileModule.findUnique({
      where: { moduleCode }
    })
    if (
      existing?.latestVersion &&
      compareSemver(app.version, existing.latestVersion) <= 0 &&
      existing.status === 'published'
    ) {
      return {
        status: false,
        msg: `发布门禁：version 须大于已发布版本 ${existing.latestVersion}`,
        data: null
      }
    }

    const now = Date.now()

    await this.prisma.client.appManage.update({
      where: { id: app.id },
      data: {
        status: 'published',
        moduleCode,
        updateTime: BigInt(now)
      }
    })

    await this.prisma.client.mobileModule.upsert({
      where: { moduleCode },
      create: {
        moduleCode,
        name: app.name,
        description: app.description,
        icon: app.icon,
        category: app.category,
        platforms: app.platforms,
        status: 'published',
        latestVersion: app.version,
        moduleUrl: app.moduleUrl,
        appManageId: app.id,
        createTime: BigInt(now),
        updateTime: BigInt(now)
      },
      update: {
        name: app.name,
        description: app.description,
        icon: app.icon,
        category: app.category,
        platforms: app.platforms,
        status: 'published',
        latestVersion: app.version,
        moduleUrl: app.moduleUrl,
        appManageId: app.id,
        updateTime: BigInt(now)
      }
    })

    await this.prisma.client.mobileModuleVersion.upsert({
      where: {
        moduleCode_version: {
          moduleCode,
          version: app.version!
        }
      },
      create: {
        moduleCode,
        version: app.version!,
        platforms: app.platforms,
        moduleUrl: app.moduleUrl,
        filePath: app.filePath,
        checksum: app.checksum,
        releaseNotes: app.releaseNotes,
        forceUpdate: app.forceUpdate || 0,
        status: 'published',
        createTime: BigInt(now)
      },
      update: {
        platforms: app.platforms,
        moduleUrl: app.moduleUrl,
        filePath: app.filePath,
        checksum: app.checksum,
        releaseNotes: app.releaseNotes,
        forceUpdate: app.forceUpdate || 0,
        status: 'published'
      }
    })

    return {
      status: true,
      msg: '发布成功',
      data: { moduleCode, version: app.version }
    }
  }

  async offlineFromAppManage(appId: number) {
    const app = await this.prisma.client.appManage.findUnique({
      where: { id: BigInt(appId) }
    })
    if (!app) return { status: false, msg: '应用不存在', data: null }
    const now = Date.now()
    await this.prisma.client.appManage.update({
      where: { id: app.id },
      data: { status: 'unpublished', updateTime: BigInt(now) }
    })
    if (app.moduleCode) {
      await this.prisma.client.mobileModule.updateMany({
        where: { moduleCode: app.moduleCode },
        data: { status: 'offline', updateTime: BigInt(now) }
      })
    }
    return {
      status: true,
      msg: '已下架',
      data: { moduleCode: app.moduleCode, status: 'offline' }
    }
  }

  async setModulePermissions(moduleCode: string, permissionCodes: string[]) {
    const now = Date.now()
    await this.prisma.client.mobileModulePermission.deleteMany({
      where: { moduleCode }
    })
    const list = [...new Set((permissionCodes || []).filter(Boolean))]
    if (list.length) {
      await this.prisma.client.mobileModulePermission.createMany({
        data: list.map(permissionCode => ({
          moduleCode,
          permissionCode,
          createTime: BigInt(now)
        }))
      })
    }
    return {
      status: true,
      msg: 'ok',
      data: { moduleCode, permissionCodes: list }
    }
  }

  async listVersions(moduleCode: string) {
    const rows = await this.prisma.client.mobileModuleVersion.findMany({
      where: { moduleCode },
      orderBy: { createTime: 'desc' }
    })
    return {
      status: true,
      msg: 'ok',
      data: { list: serializeBigInt(rows) }
    }
  }

  async listShellReleases() {
    const rows = await this.prisma.client.mobileShellRelease.findMany({
      orderBy: { createTime: 'desc' },
      take: 50
    })
    return { status: true, msg: 'ok', data: { list: serializeBigInt(rows) } }
  }

  async createShellRelease(body: {
    platform: string
    channel?: string
    version: string
    buildNumber?: string
    forceUpdate?: number | boolean
    packageUrl?: string
    releaseNotes?: string
  }) {
    if (!body.platform || !body.version) {
      return { status: false, msg: 'platform/version required', data: null }
    }
    const row = await this.prisma.client.mobileShellRelease.create({
      data: {
        platform: body.platform,
        channel: body.channel || 'default',
        version: body.version,
        buildNumber: body.buildNumber || null,
        forceUpdate: body.forceUpdate ? 1 : 0,
        packageUrl: body.packageUrl || null,
        releaseNotes: body.releaseNotes || null,
        status: 'published',
        createTime: BigInt(Date.now())
      }
    })
    return { status: true, msg: 'ok', data: serializeBigInt(row) }
  }
}
