import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { serializeBigInt } from "../../../lib/serialize";
import Log, { LOG_TYPE } from "../../../public/provider/log";

type QueryParams = {
  curPage?: number | string;
  pageSize?: number | string;
  startTime?: string | number;
  endTime?: string | number;
  username?: string;
  operation?: string;
  status?: string;
  module?: string;
  type?: string;
  operator?: string;
  method?: string;
  ip?: string;
  url?: string;
  [key: string]: unknown;
};

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  private parsePage(params: QueryParams) {
    const curPage = Math.max(1, Number(params.curPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    return { curPage, pageSize, skip: (curPage - 1) * pageSize };
  }

  private parseContent(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : { value: parsed };
    } catch {
      return { raw };
    }
  }

  private formatTime(ts: bigint | number | null | undefined) {
    if (ts == null) return "";
    const n = Number(ts);
    if (!n) return "";
    const d = new Date(n);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private buildWhere(logType: string, params: QueryParams): Prisma.LogWhereInput {
    const where: Prisma.LogWhereInput = { logType };
    const and: Prisma.LogWhereInput[] = [];

    if (params.startTime) {
      and.push({ createTime: { gte: BigInt(new Date(params.startTime).getTime()) } });
    }
    if (params.endTime) {
      const end = new Date(params.endTime);
      end.setHours(23, 59, 59, 999);
      and.push({ createTime: { lte: BigInt(end.getTime()) } });
    }
    if (params.url) {
      and.push({ originalUrl: { contains: String(params.url) } });
    }

    const keywordFields = [
      params.username,
      params.operation,
      params.status,
      params.module,
      params.type,
      params.operator,
      params.method,
      params.ip,
    ].filter(Boolean) as string[];

    for (const kw of keywordFields) {
      and.push({ content: { contains: String(kw) } });
    }

    if (and.length) where.AND = and;
    return where;
  }

  private resolveUsername(content: Record<string, unknown>): string {
    const pick = (v: unknown) =>
      v != null && String(v).trim() !== "" ? String(v) : "";

    const direct =
      pick(content.username) ||
      pick(content.operator) ||
      pick(content.name) ||
      pick(content.userName);
    if (direct) return direct;

    const userInfo = content.userInfo as Record<string, unknown> | undefined;
    if (userInfo) {
      const fromUser =
        pick(userInfo.name) ||
        pick(userInfo.username) ||
        pick(userInfo.accountAlias) ||
        pick(userInfo.phone);
      if (fromUser) return fromUser;
    }

    if (content.condition === "name" || content.condition === "phone") {
      const fromValue = pick(content.value);
      if (fromValue) return fromValue;
    }

    const params = content.params as Record<string, unknown> | undefined;
    const body = (params?.body || content.body) as
      | Record<string, unknown>
      | undefined;
    if (body && typeof body === "object") {
      const fromBody =
        pick(body.name) ||
        pick(body.username) ||
        pick(body.account) ||
        pick(body.phone);
      if (fromBody) return fromBody;
    }

    return pick(content.uid) || "";
  }

  private mapRow(row: {
    logId: bigint;
    logType: string | null;
    content: string | null;
    hostname: string | null;
    originalUrl: string | null;
    createTime: bigint | null;
  }) {
    const content = this.parseContent(row.content);
    const username = this.resolveUsername(content);
    return serializeBigInt({
      id: Number(row.logId),
      logId: Number(row.logId),
      logType: row.logType,
      hostname: row.hostname,
      originalUrl: row.originalUrl,
      create_time: this.formatTime(row.createTime),
      createTime: this.formatTime(row.createTime),
      username,
      operator: content.operator ?? username,
      operation: content.operation ?? content.method ?? "",
      method: content.method ?? "",
      params:
        typeof content.params === "string"
          ? content.params
          : content.params
            ? JSON.stringify(content.params)
            : "",
      ip: content.ip ?? row.hostname ?? "",
      status: content.status ?? (content.result === true || content.result === "success" ? "success" : content.result ? "fail" : ""),
      msg: content.msg ?? "",
      errorMsg: content.errorMsg ?? (typeof content.result === "object" ? JSON.stringify(content.result) : ""),
      module: content.module ?? "",
      type: content.type ?? row.logType ?? "",
      title: content.title ?? content.event ?? row.originalUrl ?? "",
      content:
        typeof content.content === "string"
          ? content.content
          : JSON.stringify(content),
      duration: content.duration ?? null,
      statusCode: content.statusCode ?? null,
      path: content.path ?? row.originalUrl ?? "",
      raw: content,
    });
  }

  async queryByType(logType: string, params: QueryParams) {
    const { curPage, pageSize, skip } = this.parsePage(params);
    const where = this.buildWhere(logType, params);

    const [total, rows] = await Promise.all([
      this.prisma.client.log.count({ where }),
      this.prisma.client.log.findMany({
        where,
        orderBy: { logId: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      status: true,
      msg: "查询成功",
      data: {
        list: rows.map((r) => this.mapRow(r)),
        total,
        curPage,
        pageSize,
      },
    };
  }

  async queryLoginLogs(params: QueryParams) {
    // 登录相关记录落在 operate 类型中，按 method/operation 过滤
    const result = await this.queryByType(LOG_TYPE.OPERATE, {
      ...params,
      operation: params.operation || "login",
    });
    if (result.data.list.length === 0) {
      // 无精确匹配时回退到 content 含 login 的操作日志
      return this.queryByType(LOG_TYPE.OPERATE, {
        ...params,
        operation: undefined,
        username: params.username,
      }).then((res) => {
        res.data.list = res.data.list.filter((item) => {
          const text = JSON.stringify(item.raw || item).toLowerCase();
          return text.includes("login") || text.includes("登录");
        });
        res.data.total = res.data.list.length;
        return res;
      });
    }
    return result;
  }

  async getLogStatistics() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    const countByType = async (logType: string, from: number, to?: number) => {
      return this.prisma.client.log.count({
        where: {
          logType,
          createTime: {
            gte: BigInt(from),
            ...(to != null ? { lt: BigInt(to) } : {}),
          },
        },
      });
    };

    const countFail = async (logType: string, from: number) => {
      return this.prisma.client.log.count({
        where: {
          logType,
          createTime: { gte: BigInt(from) },
          OR: [
            { content: { contains: '"status":"fail"' } },
            { content: { contains: '"status":"error"' } },
          ],
        },
      });
    };

    const [
      todayOperate,
      yesterdayOperate,
      todayApi,
      yesterdayApi,
      todayBusiness,
      todayPerf,
      errorOperate,
      yesterdayErrorOperate,
      errorApi,
      yesterdayErrorApi,
    ] = await Promise.all([
      countByType(LOG_TYPE.OPERATE, startOfToday),
      countByType(LOG_TYPE.OPERATE, startOfYesterday, startOfToday),
      countByType(LOG_TYPE.API, startOfToday),
      countByType(LOG_TYPE.API, startOfYesterday, startOfToday),
      countByType(LOG_TYPE.BUSINESS, startOfToday),
      countByType(LOG_TYPE.PERFORMANCE, startOfToday),
      countFail(LOG_TYPE.OPERATE, startOfToday),
      countFail(LOG_TYPE.OPERATE, startOfYesterday),
      countFail(LOG_TYPE.API, startOfToday),
      countFail(LOG_TYPE.API, startOfYesterday),
    ]);

    const trend = (today: number, yesterday: number) => {
      if (!yesterday) return today > 0 ? 100 : 0;
      return Math.round(((today - yesterday) / yesterday) * 100);
    };

    // 近 7 日操作趋势
    const dates: string[] = [];
    const success: number[] = [];
    const fail: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfToday - i * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const d = new Date(dayStart);
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
      const [ok, bad] = await Promise.all([
        this.prisma.client.log.count({
          where: {
            logType: LOG_TYPE.OPERATE,
            createTime: { gte: BigInt(dayStart), lt: BigInt(dayEnd) },
            NOT: {
              OR: [
                { content: { contains: '"status":"fail"' } },
                { content: { contains: '"status":"error"' } },
              ],
            },
          },
        }),
        this.prisma.client.log.count({
          where: {
            logType: LOG_TYPE.OPERATE,
            createTime: { gte: BigInt(dayStart), lt: BigInt(dayEnd) },
            OR: [
              { content: { contains: '"status":"fail"' } },
              { content: { contains: '"status":"error"' } },
            ],
          },
        }),
      ]);
      success.push(ok);
      fail.push(bad);
    }

    const recentOperate = await this.prisma.client.log.findMany({
      where: { logType: LOG_TYPE.OPERATE, createTime: { gte: BigInt(startOfToday - 6 * 86400000) } },
      select: { content: true },
      take: 500,
    });

    const opCounter = { insert: 0, update: 0, delete: 0, select: 0 };
    for (const row of recentOperate) {
      const text = (row.content || "").toLowerCase();
      if (text.includes("insert") || text.includes("create") || text.includes("register") || text.includes("新增")) {
        opCounter.insert++;
      } else if (text.includes("update") || text.includes("modify") || text.includes("修改")) {
        opCounter.update++;
      } else if (text.includes("delete") || text.includes("cancel") || text.includes("删除")) {
        opCounter.delete++;
      } else {
        opCounter.select++;
      }
    }

    return {
      status: true,
      msg: "ok",
      data: {
        todayLogin: todayOperate,
        todayOperation: todayOperate,
        todayApi,
        todayBusiness,
        todayPerformance: todayPerf,
        errorLogin: errorOperate,
        errorOperation: errorOperate + errorApi,
        loginTrend: trend(todayOperate, yesterdayOperate),
        operationTrend: trend(todayOperate, yesterdayOperate),
        apiTrend: trend(todayApi, yesterdayApi),
        errorLoginTrend: trend(errorOperate, yesterdayErrorOperate),
        errorOperationTrend: trend(errorOperate + errorApi, yesterdayErrorOperate + yesterdayErrorApi),
        charts: {
          loginChart: { dates, success, fail },
          operationChart: opCounter,
        },
      },
    };
  }

  async deleteLog(id: number | string) {
    await this.prisma.client.log.delete({ where: { logId: BigInt(id) } });
    return { status: true, msg: "删除成功", data: null };
  }

  async batchDeleteLogs(ids: Array<number | string> | string) {
    const list = Array.isArray(ids)
      ? ids
      : String(ids)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (!list.length) {
      return { status: false, msg: "请选择要删除的日志", data: null };
    }
    await this.prisma.client.log.deleteMany({
      where: { logId: { in: list.map((id) => BigInt(id)) } },
    });
    return { status: true, msg: "删除成功", data: { count: list.length } };
  }

  /** 前端埋点上报 */
  track(payload: {
    type?: string;
    event?: string;
    path?: string;
    title?: string;
    module?: string;
    username?: string;
    extra?: Record<string, unknown>;
    hostname?: string;
  }) {
    const type = payload.type || LOG_TYPE.BUSINESS;
    const logType =
      type === "pageview" || type === "click" || type === "event"
        ? LOG_TYPE.BUSINESS
        : Object.values(LOG_TYPE).includes(type as (typeof LOG_TYPE)[keyof typeof LOG_TYPE])
          ? type
          : LOG_TYPE.BUSINESS;

    Log.addLog(logType, payload.hostname || "frontend", payload.path || "", {
      type: payload.type || "event",
      event: payload.event || "",
      title: payload.title || payload.event || "track",
      module: payload.module || "frontend",
      username: payload.username || "",
      operator: payload.username || "",
      path: payload.path || "",
      status: "success",
      msg: payload.event || "track",
      ...(payload.extra || {}),
    });

    return { status: true, msg: "ok", data: null };
  }

  /** 手动写入业务/操作日志（供其它模块调用） */
  writeLog(
    logType: string,
    hostname: string,
    originalUrl: string,
    content: Record<string, unknown>,
  ) {
    Log.addLog(logType, hostname, originalUrl, content);
  }
}
