import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeBigInt } from "../../../lib/serialize";

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
};

@Injectable()
export class AppManageService {
  constructor(private readonly prisma: PrismaService) {}

  private toRow(row: {
    id: bigint;
    name: string;
    description: string | null;
    version: string | null;
    status: string | null;
    icon: string | null;
    category: string | null;
    filePath: string | null;
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
      create_time: row.createTime != null ? Number(row.createTime) : null,
      update_time: row.updateTime != null ? Number(row.updateTime) : null,
    });
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
    // BaseDialog 读取 res.data[0]
    return { status: true, msg: "ok", data: [this.toRow(row)] };
  }

  async create(body: AppBody) {
    if (!body.name) {
      return { status: false, msg: "应用名称不能为空", data: null };
    }
    const now = Date.now();
    const row = await this.prisma.client.appManage.create({
      data: {
        name: body.name,
        description: body.description || null,
        version: body.version || null,
        status: body.status || "draft",
        icon: body.icon || null,
        category: body.category || null,
        filePath: body.file_path ?? body.filePath ?? null,
        createTime: BigInt(now),
        updateTime: BigInt(now),
      },
    });
    return { status: true, msg: "创建成功", data: this.toRow(row) };
  }

  async update(body: AppBody) {
    if (!body.id) {
      return { status: false, msg: "缺少应用 id", data: null };
    }
    const row = await this.prisma.client.appManage.update({
      where: { id: BigInt(body.id) },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description || null }
          : {}),
        ...(body.version !== undefined ? { version: body.version || null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.icon !== undefined ? { icon: body.icon || null } : {}),
        ...(body.category !== undefined
          ? { category: body.category || null }
          : {}),
        ...(body.file_path !== undefined || body.filePath !== undefined
          ? { filePath: body.file_path ?? body.filePath ?? null }
          : {}),
        updateTime: BigInt(Date.now()),
      },
    });
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
    const row = await this.prisma.client.appManage.update({
      where: { id: BigInt(id) },
      data: {
        status: "published",
        updateTime: BigInt(Date.now()),
      },
    });
    return { status: true, msg: "发布成功", data: this.toRow(row) };
  }
}
