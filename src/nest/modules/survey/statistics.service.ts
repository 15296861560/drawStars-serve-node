import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SurveyService } from "./survey.service";
import {
  AuthInfo,
  asRecord,
  resolveUserId,
  rowsToCsv,
  toNum,
} from "./survey.util";

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surveyService: SurveyService,
  ) {}

  private async loadSubmitted(
    surveyId: number,
    extra: Prisma.SurveyResponseWhereInput = {},
  ) {
    return this.prisma.client.surveyResponse.findMany({
      where: {
        surveyId: BigInt(surveyId),
        status: "submitted",
        ...extra,
      },
      include: { answers: true },
      orderBy: { submittedAt: "asc" },
    });
  }

  async overview(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);

    const responseCount = await this.prisma.client.surveyResponse.count({
      where: { surveyId: BigInt(surveyId), status: "submitted" },
    });

    if (responseCount > 1000) {
      const cached =
        await this.prisma.client.surveyStatisticsSnapshot.findFirst({
          where: {
            surveyId: BigInt(surveyId),
            snapshotType: "overview",
            expiresAt: { gt: new Date() },
          },
          orderBy: { computedAt: "desc" },
        });
      if (cached?.data) {
        return cached.data;
      }
    }

    const data = await this.computeOverview(surveyId);

    if (responseCount > 1000) {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const existing =
        await this.prisma.client.surveyStatisticsSnapshot.findFirst({
          where: {
            surveyId: BigInt(surveyId),
            snapshotType: "overview",
            targetQuestionId: null,
          },
        });
      if (existing) {
        await this.prisma.client.surveyStatisticsSnapshot.update({
          where: { id: existing.id },
          data: {
            data: data as Prisma.InputJsonValue,
            sampleCount: responseCount,
            computedAt: new Date(),
            expiresAt,
          },
        });
      } else {
        await this.prisma.client.surveyStatisticsSnapshot.create({
          data: {
            surveyId: BigInt(surveyId),
            snapshotType: "overview",
            data: data as Prisma.InputJsonValue,
            sampleCount: responseCount,
            computedAt: new Date(),
            expiresAt,
          },
        });
      }
    }

    return data;
  }

  private async computeOverview(surveyId: number) {
    const responses = await this.loadSubmitted(surveyId);
    const valid = responses.filter((r) => r.isValid);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCount = responses.filter(
      (r) => r.submittedAt && r.submittedAt >= todayStart,
    ).length;

    const durations = valid.map((r) => r.duration).filter((d) => d > 0);
    const avgDuration =
      durations.length > 0
        ? Math.round(
            (durations.reduce((a, b) => a + b, 0) / durations.length) * 100,
          ) / 100
        : 0;

    const dayMap = new Map<string, number>();
    for (const r of responses) {
      if (!r.submittedAt) continue;
      const key = r.submittedAt.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }
    const trend = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const sourceMap = new Map<string, number>();
    const deviceMap = new Map<string, number>();
    for (const r of responses) {
      const src = r.source || "unknown";
      sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
      const di = asRecord(r.deviceInfo);
      const device = String(di.os || di.platform || di.type || "unknown");
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
    }

    const pub = await this.prisma.client.surveyPublishConfig.findUnique({
      where: { surveyId: BigInt(surveyId) },
    });

    return {
      totalResponses: responses.length,
      validResponses: valid.length,
      invalidResponses: responses.length - valid.length,
      todayResponses: todayCount,
      todayCount,
      avgDuration,
      clickCount: pub?.clickCount ?? 0,
      completionRate:
        responses.length > 0
          ? Math.round((valid.length / responses.length) * 1000) / 1000
          : null,
      recoveryRate:
        pub && pub.clickCount > 0
          ? Math.round((responses.length / pub.clickCount) * 1000) / 1000
          : null,
      trend,
      sourceDistribution: [...sourceMap.entries()].map(([name, count]) => ({
        name,
        count,
        value: count,
      })),
      deviceDistribution: [...deviceMap.entries()].map(([name, count]) => ({
        name,
        count,
        value: count,
      })),
    };
  }

  async questionStats(
    surveyId: number,
    questionId: number,
    auth?: AuthInfo,
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const question = await this.prisma.client.surveyQuestion.findFirst({
      where: { id: BigInt(questionId), surveyId: BigInt(surveyId) },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    });
    if (!question) throw new NotFoundException("题目不存在");

    const responses = await this.loadSubmitted(surveyId, { isValid: true });
    const answers = responses.flatMap((r) =>
      r.answers.filter((a) => Number(a.questionId) === questionId),
    );
    const answeredCount = answers.length;
    const total = responses.length;
    const type = question.type;

    if (
      type === "radio" ||
      type === "checkbox" ||
      type === "judge" ||
      type === "select"
    ) {
      const optionCounts = new Map<string, number>();
      for (const o of question.options) {
        optionCounts.set(String(o.id), 0);
        optionCounts.set(o.content, 0);
      }
      for (const a of answers) {
        const data = asRecord(a.answerData);
        const values = Array.isArray(data.value)
          ? data.value
          : Array.isArray(data.values)
            ? data.values
            : data.value != null
              ? [data.value]
              : Array.isArray(a.answerData)
                ? (a.answerData as unknown[])
                : [];
        for (const v of values) {
          const key = String(v);
          optionCounts.set(key, (optionCounts.get(key) || 0) + 1);
        }
      }
      const distribution = question.options.map((o) => {
        const byId = optionCounts.get(String(o.id)) || 0;
        const byContent = optionCounts.get(o.content) || 0;
        const count = Math.max(byId, byContent);
        return {
          optionId: Number(o.id),
          content: o.content,
          count,
          percent: answeredCount ? count / answeredCount : 0,
        };
      });
      return {
        questionId,
        type,
        title: question.title,
        total,
        answeredCount,
        skipRate: total ? (total - answeredCount) / total : 0,
        distribution,
      };
    }

    if (
      type === "rating" ||
      type === "nps" ||
      type === "number" ||
      type === "slider"
    ) {
      const nums: number[] = [];
      for (const a of answers) {
        const data = asRecord(a.answerData);
        const n = Number(data.value ?? a.textContent);
        if (Number.isFinite(n)) nums.push(n);
      }
      const avg =
        nums.length > 0
          ? nums.reduce((x, y) => x + y, 0) / nums.length
          : 0;
      const bucket = new Map<number, number>();
      for (const n of nums) bucket.set(n, (bucket.get(n) || 0) + 1);
      return {
        questionId,
        type,
        title: question.title,
        total,
        answeredCount,
        average: Math.round(avg * 100) / 100,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        distribution: [...bucket.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([value, count]) => ({ value, count })),
      };
    }

    if (type === "matrix_radio" || type === "matrix_input") {
      const cfg = asRecord(question.config);
      const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
      const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
      const cellCounts = new Map<string, number>();
      for (const a of answers) {
        const data = asRecord(a.answerData);
        const value = asRecord(data.value ?? data);
        for (const [rowKey, cell] of Object.entries(value)) {
          const key = `${rowKey}::${String(cell)}`;
          cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
        }
      }
      const matrix = rows.map((r) => {
        const row = asRecord(r);
        const rowId = String(row.id ?? row.label ?? "");
        return {
          rowId,
          rowLabel: String(row.label ?? rowId),
          cells: cols.map((c) => {
            const col = asRecord(c);
            const colId = String(col.id ?? col.label ?? "");
            const count =
              cellCounts.get(`${rowId}::${colId}`) ||
              cellCounts.get(`${rowId}::${col.label}`) ||
              0;
            return {
              colId,
              colLabel: String(col.label ?? colId),
              count,
              percent: answeredCount ? count / answeredCount : 0,
            };
          }),
        };
      });
      return {
        questionId,
        type,
        title: question.title,
        total,
        answeredCount,
        skipRate: total ? (total - answeredCount) / total : 0,
        matrix,
      };
    }

    if (type === "sort") {
      const rankSums = new Map<string, { sum: number; count: number; label: string }>();
      for (const o of question.options) {
        rankSums.set(String(o.id), {
          sum: 0,
          count: 0,
          label: o.content,
        });
        rankSums.set(o.content, {
          sum: 0,
          count: 0,
          label: o.content,
        });
      }
      for (const a of answers) {
        const data = asRecord(a.answerData);
        const order = Array.isArray(data.value)
          ? data.value
          : Array.isArray(data.values)
            ? data.values
            : [];
        order.forEach((v, idx) => {
          const key = String(v);
          const cur = rankSums.get(key) || {
            sum: 0,
            count: 0,
            label: key,
          };
          cur.sum += idx + 1;
          cur.count += 1;
          rankSums.set(key, cur);
        });
      }
      const ranking = question.options.map((o) => {
        const byId = rankSums.get(String(o.id));
        const byContent = rankSums.get(o.content);
        const chosen =
          (byId?.count || 0) >= (byContent?.count || 0) ? byId : byContent;
        const avgRank =
          chosen && chosen.count > 0 ? chosen.sum / chosen.count : null;
        return {
          optionId: Number(o.id),
          content: o.content,
          averageRank: avgRank != null ? Math.round(avgRank * 100) / 100 : null,
          count: chosen?.count || 0,
        };
      });
      return {
        questionId,
        type,
        title: question.title,
        total,
        answeredCount,
        skipRate: total ? (total - answeredCount) / total : 0,
        ranking,
      };
    }

    // text-like
    const samples = answers.slice(0, 50).map((a) => ({
      responseId: Number(a.responseId),
      text: a.textContent || String(asRecord(a.answerData).value ?? ""),
    }));
    const lengths = samples
      .map((s) => s.text.length)
      .filter((n) => n > 0);
    const wordFreq = new Map<string, number>();
    for (const s of samples) {
      const words = s.text
        .split(/[\s,，。.!！?？;；:：、]+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      for (const w of words) {
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      }
    }
    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));
    return {
      questionId,
      type,
      title: question.title,
      total,
      answeredCount,
      avgLength:
        lengths.length > 0
          ? Math.round(
              (lengths.reduce((a, b) => a + b, 0) / lengths.length) * 100,
            ) / 100
          : 0,
      topWords,
      samples,
    };
  }

  async crossAnalysis(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: {
      rowQuestionId?: number;
      colQuestionId?: number;
      rowDimension?: number | string;
      colDimension?: number | string;
      metric?: string;
    },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const rowQ = Number(body.rowQuestionId ?? body.rowDimension);
    const colQ = Number(body.colQuestionId ?? body.colDimension);
    if (!rowQ || !colQ) throw new BadRequestException("缺少交叉维度");

    const responses = await this.loadSubmitted(surveyId, { isValid: true });
    const matrix = new Map<string, Map<string, number>>();
    const rowKeys = new Set<string>();
    const colKeys = new Set<string>();

    const extract = (answerData: unknown) => {
      const data = asRecord(answerData);
      const v = data.value ?? data.values;
      if (Array.isArray(v)) return v.map(String);
      if (v != null) return [String(v)];
      return ["(空)"];
    };

    for (const r of responses) {
      const ra = r.answers.find((a) => Number(a.questionId) === rowQ);
      const ca = r.answers.find((a) => Number(a.questionId) === colQ);
      const rows = ra ? extract(ra.answerData) : ["(空)"];
      const cols = ca ? extract(ca.answerData) : ["(空)"];
      for (const rk of rows) {
        rowKeys.add(rk);
        if (!matrix.has(rk)) matrix.set(rk, new Map());
        for (const ck of cols) {
          colKeys.add(ck);
          const m = matrix.get(rk)!;
          m.set(ck, (m.get(ck) || 0) + 1);
        }
      }
    }

    const rows = [...rowKeys];
    const cols = [...colKeys];
    const cells = rows.map((rk) =>
      cols.map((ck) => matrix.get(rk)?.get(ck) || 0),
    );

    return {
      rowQuestionId: rowQ,
      colQuestionId: colQ,
      rows,
      cols,
      cells,
      matrix: cells,
      metric: body.metric || "count",
      sampleCount: responses.length,
    };
  }

  async qualityAnalysis(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const responses = await this.loadSubmitted(surveyId);
    const survey = await this.prisma.client.survey.findUnique({
      where: { id: BigInt(surveyId) },
      include: { publishConfig: true, questions: true },
    });
    const minDuration = survey?.publishConfig?.minDuration || 0;

    const invalid = responses.filter((r) => !r.isValid);
    const tooFast = responses.filter(
      (r) => minDuration > 0 && r.duration > 0 && r.duration < minDuration,
    );
    const ipMap = new Map<string, number[]>();
    for (const r of responses) {
      if (!r.ip) continue;
      const arr = ipMap.get(r.ip) || [];
      arr.push(Number(r.id));
      ipMap.set(r.ip, arr);
    }
    const duplicateIps = [...ipMap.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([ip, ids]) => ({ ip, responseIds: ids, count: ids.length }));

    const missingByQuestion = survey!.questions.map((q) => {
      const answered = responses.filter((r) =>
        r.answers.some((a) => Number(a.questionId) === Number(q.id)),
      ).length;
      return {
        questionId: Number(q.id),
        title: q.title,
        missingRate: responses.length
          ? (responses.length - answered) / responses.length
          : 0,
      };
    });

    // Open-text simple similarity (Jaccard on character bigrams)
    const openQids = new Set(
      (survey?.questions || [])
        .filter((q) =>
          ["input", "textarea", "text"].includes(q.type),
        )
        .map((q) => Number(q.id)),
    );
    const similarPairs: Array<{
      a: number;
      b: number;
      score: number;
      questionId: number;
    }> = [];
    const bigrams = (t: string) => {
      const s = t.trim().toLowerCase();
      const set = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const jaccard = (a: Set<string>, b: Set<string>) => {
      if (!a.size && !b.size) return 1;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter += 1;
      return inter / (a.size + b.size - inter || 1);
    };
    for (const qid of openQids) {
      const texts = responses
        .map((r) => {
          const ans = r.answers.find((a) => Number(a.questionId) === qid);
          const text =
            ans?.textContent ||
            String(asRecord(ans?.answerData).value ?? "");
          return { id: Number(r.id), text: text.trim() };
        })
        .filter((t) => t.text.length >= 8);
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const score = jaccard(bigrams(texts[i].text), bigrams(texts[j].text));
          if (score >= 0.85) {
            similarPairs.push({
              a: texts[i].id,
              b: texts[j].id,
              score: Math.round(score * 100) / 100,
              questionId: qid,
            });
          }
        }
      }
    }

    return {
      total: responses.length,
      invalidCount: invalid.length,
      tooFastCount: tooFast.length,
      shortDurationCount: tooFast.length,
      duplicateIpGroups: duplicateIps,
      duplicateCount: duplicateIps.reduce((s, g) => s + g.count, 0),
      similarTextPairs: similarPairs.slice(0, 50),
      missingByQuestion,
      invalidList: invalid.map((r) => ({
        responseId: Number(r.id),
        reason: r.invalidReason,
        duration: r.duration,
        ip: r.ip,
        submittedAt: r.submittedAt?.toISOString() ?? null,
      })),
      list: invalid.map((r) => ({
        responseId: Number(r.id),
        reason: r.invalidReason,
        duration: r.duration,
        ip: r.ip,
        submittedAt: r.submittedAt?.toISOString() ?? null,
      })),
    };
  }

  async markQuality(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: {
      responseIds: Array<number | string>;
      isValid: boolean;
      reason?: string;
    },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true,
    });
    const ids = (body.responseIds || []).map((id) => BigInt(Number(id)));
    if (!ids.length) throw new BadRequestException("缺少 responseIds");

    await this.prisma.client.surveyResponse.updateMany({
      where: { surveyId: BigInt(surveyId), id: { in: ids } },
      data: {
        isValid: Boolean(body.isValid),
        invalidReason: body.isValid
          ? null
          : body.reason || "人工标记无效",
      },
    });
    return { updated: ids.length, isValid: Boolean(body.isValid) };
  }

  private buildFilterWhere(
    surveyId: number,
    filter: Record<string, unknown> = {},
  ): Prisma.SurveyResponseWhereInput {
    const where: Prisma.SurveyResponseWhereInput = {
      surveyId: BigInt(surveyId),
      status: "submitted",
    };
    if (filter.isValid === true || filter.isValid === "true") where.isValid = true;
    if (filter.isValid === false || filter.isValid === "false") {
      where.isValid = false;
    }
    if (filter.source) where.source = String(filter.source);
    if (filter.userId) where.userId = BigInt(Number(filter.userId));
    if (filter.startTime || filter.endTime) {
      where.submittedAt = {};
      if (filter.startTime) {
        where.submittedAt.gte = new Date(String(filter.startTime));
      }
      if (filter.endTime) {
        where.submittedAt.lte = new Date(String(filter.endTime));
      }
    }
    if (filter.minDuration != null || filter.maxDuration != null) {
      where.duration = {};
      if (filter.minDuration != null) {
        where.duration.gte = Number(filter.minDuration);
      }
      if (filter.maxDuration != null) {
        where.duration.lte = Number(filter.maxDuration);
      }
    }
    return where;
  }

  async filterStats(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: { filter?: Record<string, unknown> },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const where = this.buildFilterWhere(surveyId, body.filter || {});
    const responses = await this.prisma.client.surveyResponse.findMany({
      where,
      include: { answers: true },
    });
    const durations = responses.map((r) => r.duration).filter((d) => d > 0);
    return {
      filter: body.filter || {},
      totalResponses: responses.length,
      validResponses: responses.filter((r) => r.isValid).length,
      avgDuration:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
      responseIds: responses.map((r) => Number(r.id)),
    };
  }

  async compareViews(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: {
      viewA?: Record<string, unknown>;
      viewB?: Record<string, unknown>;
      filters?: [Record<string, unknown>, Record<string, unknown>];
    },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const a = body.viewA || body.filters?.[0] || {};
    const b = body.viewB || body.filters?.[1] || {};
    const statsA = await this.filterStats(surveyId, auth, { filter: a });
    const statsB = await this.filterStats(surveyId, auth, { filter: b });
    const diff = {
      totalResponses: statsA.totalResponses - statsB.totalResponses,
      validResponses: statsA.validResponses - statsB.validResponses,
      avgDuration: statsA.avgDuration - statsB.avgDuration,
      changeRate:
        statsB.totalResponses > 0
          ? (statsA.totalResponses - statsB.totalResponses) /
            statsB.totalResponses
          : null,
    };
    return { viewA: statsA, viewB: statsB, diff };
  }

  async listReports(surveyId: number, auth?: AuthInfo) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const rows = await this.prisma.client.surveyReportView.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: Number(r.id),
      surveyId: Number(r.surveyId),
      userId: Number(r.userId),
      name: r.name,
      config: r.config,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createReport(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: { name?: string; config?: Record<string, unknown> },
  ) {
    const userId = resolveUserId(auth);
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true,
    });
    const name = String(body.name || "自定义报表").trim();
    const row = await this.prisma.client.surveyReportView.create({
      data: {
        surveyId: BigInt(surveyId),
        userId: BigInt(userId),
        name,
        config: (body.config || {}) as Prisma.InputJsonValue,
      },
    });
    return {
      id: Number(row.id),
      surveyId: Number(row.surveyId),
      userId: Number(row.userId),
      name: row.name,
      config: row.config,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateReport(
    surveyId: number,
    reportId: number,
    auth: AuthInfo | undefined,
    body: { name?: string; config?: Record<string, unknown> },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true,
    });
    const existing = await this.prisma.client.surveyReportView.findFirst({
      where: { id: BigInt(reportId), surveyId: BigInt(surveyId) },
    });
    if (!existing) throw new NotFoundException("报表不存在");
    const row = await this.prisma.client.surveyReportView.update({
      where: { id: existing.id },
      data: {
        ...(body.name != null ? { name: String(body.name) } : {}),
        ...(body.config != null
          ? { config: body.config as Prisma.InputJsonValue }
          : {}),
      },
    });
    return {
      id: Number(row.id),
      name: row.name,
      config: row.config,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteReport(
    surveyId: number,
    reportId: number,
    auth?: AuthInfo,
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth, {
      write: true,
    });
    await this.prisma.client.surveyReportView.deleteMany({
      where: { id: BigInt(reportId), surveyId: BigInt(surveyId) },
    });
    return true;
  }

  private async buildExportRows(
    surveyId: number,
    options: { onlyValid?: boolean } = {},
  ) {
    const questions = await this.prisma.client.surveyQuestion.findMany({
      where: { surveyId: BigInt(surveyId) },
      orderBy: { sortOrder: "asc" },
    });
    const where: Prisma.SurveyResponseWhereInput = {
      surveyId: BigInt(surveyId),
      status: "submitted",
    };
    if (options.onlyValid) where.isValid = true;

    const responses = await this.prisma.client.surveyResponse.findMany({
      where,
      include: { answers: true },
      orderBy: { submittedAt: "asc" },
    });

    const headers = [
      "responseId",
      "userId",
      "submittedAt",
      "duration",
      "ip",
      "source",
      "isValid",
      ...questions.map((q, i) => `Q${i + 1}:${q.title}`.slice(0, 80)),
    ];

    const rows = responses.map((r) => {
      const answerCells = questions.map((q) => {
        const a = r.answers.find(
          (x) => Number(x.questionId) === Number(q.id),
        );
        if (!a) return "";
        if (a.textContent) return a.textContent;
        const data = asRecord(a.answerData);
        const v = data.value ?? data.values ?? a.answerData;
        return typeof v === "string" ? v : JSON.stringify(v);
      });
      return [
        Number(r.id),
        toNum(r.userId) ?? "",
        r.submittedAt?.toISOString() ?? "",
        r.duration,
        r.ip ?? "",
        r.source ?? "",
        r.isValid,
        ...answerCells,
      ];
    });

    return { headers, rows, questions, responses };
  }

  async exportSync(
    surveyId: number,
    auth: AuthInfo | undefined,
    query: { format?: string; onlyValid?: string },
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const format = (query.format || "json").toLowerCase();
    const onlyValid = query.onlyValid === "1" || query.onlyValid === "true";
    const { headers, rows } = await this.buildExportRows(surveyId, {
      onlyValid,
    });

    if (format === "csv" || format === "excel" || format === "xlsx") {
      return {
        format: "csv" as const,
        filename: `survey_${surveyId}.csv`,
        contentType: "text/csv",
        content: rowsToCsv(headers, rows),
        note:
          format === "excel" || format === "xlsx"
            ? "返回 CSV，前端可用 xlsx 库转换"
            : undefined,
      };
    }

    const jsonRows = rows.map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i];
      });
      return obj;
    });
    return {
      format: "json",
      filename: `survey_${surveyId}.json`,
      contentType: "application/json",
      rows: jsonRows,
    };
  }

  async createExportTask(
    surveyId: number,
    auth: AuthInfo | undefined,
    body: { format?: string; onlyValid?: boolean; options?: Record<string, unknown> },
  ) {
    const userId = resolveUserId(auth);
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const format = (body.format || "json").toLowerCase();

    const task = await this.prisma.client.surveyExportTask.create({
      data: {
        surveyId: BigInt(surveyId),
        userId: BigInt(userId),
        format,
        status: "pending",
        options: {
          onlyValid: Boolean(body.onlyValid),
          ...(body.options || {}),
        } as Prisma.InputJsonValue,
      },
    });

    // process inline — keep full payload in options.result only
    try {
      const exported = await this.exportSync(surveyId, auth, {
        format,
        onlyValid: body.onlyValid ? "1" : "0",
      });
      const payload =
        "content" in exported
          ? { content: exported.content, format: exported.format }
          : { rows: exported.rows, format: exported.format };

      const done = await this.prisma.client.surveyExportTask.update({
        where: { id: task.id },
        data: {
          status: "completed",
          filePath: `inline:task:${Number(task.id)}`,
          options: {
            ...asRecord(task.options),
            result: payload,
            filename: exported.filename,
          } as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return this.mapTask(done);
    } catch (e) {
      const failed = await this.prisma.client.surveyExportTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          errorMsg: e instanceof Error ? e.message.slice(0, 250) : "导出失败",
          finishedAt: new Date(),
        },
      });
      return this.mapTask(failed);
    }
  }

  async getExportTask(
    surveyId: number,
    taskId: number,
    auth?: AuthInfo,
  ) {
    await this.surveyService.assertSurveyAccess(surveyId, auth);
    const task = await this.prisma.client.surveyExportTask.findFirst({
      where: { id: BigInt(taskId), surveyId: BigInt(surveyId) },
    });
    if (!task) throw new NotFoundException("导出任务不存在");
    return this.mapTask(task);
  }

  private mapTask(task: {
    id: bigint;
    surveyId: bigint;
    userId: bigint;
    format: string;
    status: string;
    filePath: string | null;
    errorMsg: string | null;
    options: unknown;
    createdAt: Date;
    finishedAt: Date | null;
  }) {
    const options = asRecord(task.options);
    return {
      id: Number(task.id),
      surveyId: Number(task.surveyId),
      userId: Number(task.userId),
      format: task.format,
      status: task.status,
      filePath: task.filePath,
      errorMsg: task.errorMsg,
      result: options.result ?? null,
      filename: options.filename ?? null,
      createdAt: task.createdAt.toISOString(),
      finishedAt: task.finishedAt?.toISOString() ?? null,
    };
  }
}
