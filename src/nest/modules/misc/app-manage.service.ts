import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeBigInt } from "../../../lib/serialize";
import { MobileService } from "../mobile/mobile.service";

type AppBody = {
  id?: number | string;
  name?: string;
  description?: string;
  version?: string;
  status?: string;
  icon?: string;
  category?: string;
  file_path?: string;
  filePath?: string;
  module_code?: string;
  moduleCode?: string;
  platforms?: string | string[];
  module_url?: string;
  moduleUrl?: string;
  checksum?: string;
  release_notes?: string;
  releaseNotes?: string;
  force_update?: number | boolean;
  forceUpdate?: number | boolean;
  min_shell_version?: string;
  minShellVersion?: string;
  permission_codes?: string[];
  permissionCodes?: string[];
};

function platformsToStr(v?: string | string[]) {
  if (Array.isArray(v)) return v.join(",");
  return v || null;
}

@Injectable()
export class AppManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mobileService: MobileService,
  ) {}

  private toRow(row: {
    id: bigint;
    name: string;
    description: string | null;
    version: string | null;
    status: string | null;
    icon: string | null;
    category: string | null;
    filePath: string | null;
    moduleCode?: string | null;
    platforms?: string | null;
    moduleUrl?: string | null;
    checksum?: string | null;
    releaseNotes?: string | null;
    forceUpdate?: number | null;
    minShellVersion?: string | null;
    createTime: bigint | null;
    updateTime: bigint | null;
  }) {
    return serializeBigInt({
      id: Number(row.id),
      name: row.name,
      description: row.description,
      version: row.version,
      status: row.status,
      icon: row.icon,
      category: row.category,
      file_path: row.filePath,
      module_code: row.moduleCode ?? null,
      platforms: row.platforms
        ? row.platforms.split(",").filter(Boolean)
        : [],
      module_url: row.moduleUrl ?? null,
      checksum: row.checksum ?? null,
      release_notes: row.releaseNotes ?? null,
      force_update: row.forceUpdate ?? 0,
      min_shell_version: row.minShellVersion ?? null,
      create_time: row.createTime != null ? Number(row.createTime) : null,
      update_time: row.updateTime != null ? Number(row.updateTime) : null,
    });
  }

  private mapBody(body: AppBody) {
    return {
      name: body.name,
      description: body.description,
      version: body.version,
      status: body.status,
      icon: body.icon,
      category: body.category,
      filePath: body.file_path ?? body.filePath,
      moduleCode: body.module_code ?? body.moduleCode,
      platforms: platformsToStr(body.platforms) ?? undefined,
      moduleUrl: body.module_url ?? body.moduleUrl,
      checksum: body.checksum,
      releaseNotes: body.release_notes ?? body.releaseNotes,
      forceUpdate:
        body.force_update === true || body.forceUpdate === true
          ? 1
          : body.force_update === false || body.forceUpdate === false
            ? 0
            : body.force_update != null
              ? Number(body.force_update)
              : body.forceUpdate != null
                ? Number(body.forceUpdate)
                : undefined,
      minShellVersion: body.min_shell_version ?? body.minShellVersion,
    };
  }

  async list(params: {
    name?: string;
    status?: string;
    category?: string;
    curPage?: string | number;
    pageSize?: string | number;
  }) {
    const curPage = Math.max(1, Number(params.curPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const where: Prisma.AppManageWhereInput = {};

    if (params.name?.trim()) {
      where.name = { contains: params.name.trim() };
    }
    if (params.status) where.status = params.status;
    if (params.category) where.category = params.category;

    const [total, rows] = await Promise.all([
      this.prisma.client.appManage.count({ where }),
      this.prisma.client.appManage.findMany({
        where,
        skip: (curPage - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
      }),
    ]);

    return {
      status: true,
      msg: "ok",
      data: {
        records: rows.map((r) => this.toRow(r)),
        total,
        curPage,
        pageSize,
      },
    };
  }

  async detail(id: number) {
    const row = await this.prisma.client.appManage.findUnique({
      where: { id: BigInt(id) },
    });
    if (!row) {
      return { status: false, msg: "应用不存在", data: [] };
    }
    const dto = this.toRow(row) as Record<string, unknown>;
    if (row.moduleCode) {
      const perms = await this.prisma.client.mobileModulePermission.findMany({
        where: { moduleCode: row.moduleCode },
      });
      dto.permission_codes = perms.map((p) => p.permissionCode);
    } else {
      dto.permission_codes = [];
    }
    return { status: true, msg: "ok", data: [dto] };
  }

  async create(body: AppBody) {
    if (!body.name) {
      return { status: false, msg: "应用名称不能为空", data: null };
    }
    const now = Date.now();
    const mapped = this.mapBody(body);
    const row = await this.prisma.client.appManage.create({
      data: {
        name: mapped.name!,
        description: mapped.description || null,
        version: mapped.version || null,
        status: mapped.status || "draft",
        icon: mapped.icon || null,
        category: mapped.category || null,
        filePath: mapped.filePath ?? null,
        moduleCode: mapped.moduleCode || null,
        platforms: mapped.platforms || null,
        moduleUrl: mapped.moduleUrl || null,
        checksum: mapped.checksum || null,
        releaseNotes: mapped.releaseNotes || null,
        forceUpdate: mapped.forceUpdate ?? 0,
        minShellVersion: mapped.minShellVersion || null,
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
    });
    const codes = body.permission_codes || body.permissionCodes;
    if (codes?.length && row.moduleCode) {
      await this.mobileService.setModulePermissions(row.moduleCode, codes);
    }
    return { status: true, msg: "创建成功", data: this.toRow(row) };
  }

  async update(body: AppBody) {
    if (!body.id) {
      return { status: false, msg: "缺少应用 id", data: null };
    }
    const mapped = this.mapBody(body);
    const row = await this.prisma.client.appManage.update({
      where: { id: BigInt(body.id) },
      data: {
        ...(mapped.name !== undefined ? { name: mapped.name } : {}),
        ...(mapped.description !== undefined
          ? { description: mapped.description || null }
          : {}),
        ...(mapped.version !== undefined
          ? { version: mapped.version || null }
          : {}),
        ...(mapped.status !== undefined ? { status: mapped.status } : {}),
        ...(mapped.icon !== undefined ? { icon: mapped.icon || null } : {}),
        ...(mapped.category !== undefined
          ? { category: mapped.category || null }
          : {}),
        ...(mapped.filePath !== undefined
          ? { filePath: mapped.filePath || null }
          : {}),
        ...(mapped.moduleCode !== undefined
          ? { moduleCode: mapped.moduleCode || null }
          : {}),
        ...(mapped.platforms !== undefined
          ? { platforms: mapped.platforms || null }
          : {}),
        ...(mapped.moduleUrl !== undefined
          ? { moduleUrl: mapped.moduleUrl || null }
          : {}),
        ...(mapped.checksum !== undefined
          ? { checksum: mapped.checksum || null }
          : {}),
        ...(mapped.releaseNotes !== undefined
          ? { releaseNotes: mapped.releaseNotes || null }
          : {}),
        ...(mapped.forceUpdate !== undefined
          ? { forceUpdate: mapped.forceUpdate }
          : {}),
        ...(mapped.minShellVersion !== undefined
          ? { minShellVersion: mapped.minShellVersion || null }
          : {}),
        updateTime: BigInt(Date.now()),
      },
    });
    const codes = body.permission_codes || body.permissionCodes;
    if (codes && row.moduleCode) {
      await this.mobileService.setModulePermissions(row.moduleCode, codes);
    }
    return { status: true, msg: "更新成功", data: this.toRow(row) };
  }

  async remove(id: number) {
    await this.prisma.client.appManage.delete({ where: { id: BigInt(id) } });
    return { status: true, msg: "删除成功", data: true };
  }

  async batchDelete(ids: Array<number | string>) {
    const list = (ids || []).map(Number).filter(Boolean);
    if (!list.length) {
      return { status: false, msg: "未选择数据", data: null };
    }
    await this.prisma.client.appManage.deleteMany({
      where: { id: { in: list.map((id) => BigInt(id)) } },
    });
    return { status: true, msg: "删除成功", data: true };
  }

  async upgrade(id: number, filePath?: string) {
    if (!id) return { status: false, msg: "缺少应用 id", data: null };
    if (!filePath) return { status: false, msg: "缺少文件路径", data: null };
    const row = await this.prisma.client.appManage.update({
      where: { id: BigInt(id) },
      data: {
        filePath,
        updateTime: BigInt(Date.now()),
      },
    });
    return { status: true, msg: "更新成功", data: this.toRow(row) };
  }

  async publish(id: number) {
    return this.mobileService.publishFromAppManage(id);
  }

  async offline(id: number) {
    return this.mobileService.offlineFromAppManage(id);
  }

  async versions(id: number) {
    const app = await this.prisma.client.appManage.findUnique({
      where: { id: BigInt(id) },
    });
    if (!app?.moduleCode) {
      return { status: true, msg: "ok", data: { list: [] } };
    }
    return this.mobileService.listVersions(app.moduleCode);
  }
}
