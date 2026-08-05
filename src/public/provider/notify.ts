import { prisma } from "../../lib/prisma";
import { serializeBigInt } from "../../lib/serialize";

function toBigIntId(value: string | number | undefined, fieldName: string): bigint {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} is required`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${fieldName} must be a valid integer`);
  }
}

function decodeNotifyMsg(msg: unknown): string {
  if (msg == null) return "";
  if (Buffer.isBuffer(msg)) return msg.toString("utf8");
  if (typeof msg === "string") return msg;
  if (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: string }).type === "Buffer" &&
    Array.isArray((msg as { data?: number[] }).data)
  ) {
    return Buffer.from((msg as { data: number[] }).data).toString("utf8");
  }
  if (msg instanceof Uint8Array) return Buffer.from(msg).toString("utf8");
  return String(msg);
}

function parseNotifyPayload(raw: string): {
  title: string;
  content: string;
} {
  if (!raw) return { title: "", content: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const title = parsed.title != null ? String(parsed.title) : "";
      const content = String(
        parsed.content ??
          parsed.notifyMsg ??
          parsed.msg ??
          (title ? "" : raw),
      );
      return { title, content: content || title };
    }
  } catch {
    /* plain text */
  }
  return { title: "", content: raw };
}

type NotifyRow = {
  id: bigint;
  createTime: bigint | null;
  updateTime: bigint | null;
  createBy: bigint | null;
  updateBy: bigint | null;
  notifyType: string | null;
  notifyMsg: Buffer | Uint8Array | null;
  sendId: bigint | null;
  receiveId: bigint | null;
  isRead?: boolean;
};

function formatNotify(row: NotifyRow) {
  const raw = decodeNotifyMsg(row.notifyMsg);
  const { title, content } = parseNotifyPayload(raw);
  return serializeBigInt({
    id: Number(row.id),
    title,
    content,
    rawMsg: raw,
    tag: row.notifyType || "系统",
    notifyType: row.notifyType,
    createTime: row.createTime != null ? Number(row.createTime) : null,
    updateTime: row.updateTime != null ? Number(row.updateTime) : null,
    sendId: row.sendId != null ? Number(row.sendId) : null,
    receiveId: row.receiveId != null ? Number(row.receiveId) : null,
    isRead: Boolean(row.isRead),
  });
}

const addNotify = async (
  sendId: string | number,
  receiveId: string | number,
  notifyType: string,
  notifyMsg: string,
) => {
  const curTime = new Date().getTime();
  const sendUserId = toBigIntId(sendId, "sendId");
  const receiveUserId = toBigIntId(receiveId, "receiveId");
  return prisma.notify.create({
    data: {
      sendId: sendUserId,
      receiveId: receiveUserId,
      notifyType,
      notifyMsg: Buffer.from(notifyMsg || ""),
      createTime: BigInt(curTime),
      updateTime: BigInt(curTime),
      createBy: sendUserId,
      updateBy: sendUserId,
      isRead: false,
    },
  });
};

const queryNotifyById = async (notify_id: string | number) => {
  const notifyId = toBigIntId(notify_id, "notifyId");
  const rows = await prisma.notify.findMany({
    where: { id: notifyId },
  });
  return rows.map((r) => formatNotify(r as NotifyRow));
};

const queryNotifyByType = async (notifyType: string) => {
  const rows = await prisma.notify.findMany({
    where: { notifyType },
    orderBy: { createTime: "desc" },
  });
  return rows.map((r) => formatNotify(r as NotifyRow));
};

const queryMyNotifyByType = async (
  notifyType: string,
  userId: string | number,
) => {
  const targetUserId = toBigIntId(userId, "userId");
  const rows = await prisma.notify.findMany({
    where: { notifyType, receiveId: targetUserId },
    orderBy: { createTime: "desc" },
  });
  return rows.map((r) => formatNotify(r as NotifyRow));
};

const queryAllNotify = async () => {
  const rows = await prisma.notify.findMany({
    orderBy: { createTime: "desc" },
  });
  return rows.map((r) => formatNotify(r as NotifyRow));
};

type QueryMyParams = {
  userId: string | number;
  status?: "all" | "read" | "unread";
  curPage?: number | string;
  pageSize?: number | string;
};

const queryMyAllNotify = async (params: QueryMyParams | string | number) => {
  const options: QueryMyParams =
    typeof params === "object" && params !== null
      ? params
      : { userId: params as string | number };

  const targetUserId = toBigIntId(options.userId, "userId");
  const where: {
    receiveId: bigint;
    isRead?: boolean;
  } = { receiveId: targetUserId };

  if (options.status === "read") where.isRead = true;
  if (options.status === "unread") where.isRead = false;

  const curPage = Math.max(1, Number(options.curPage) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));

  const [total, rows] = await Promise.all([
    prisma.notify.count({ where }),
    prisma.notify.findMany({
      where,
      orderBy: { createTime: "desc" },
      skip: (curPage - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const list = rows.map((r) => formatNotify(r as NotifyRow));
  return {
    list,
    total,
    curPage,
    pageSize,
    hasMore: curPage * pageSize < total,
  };
};

const getUnreadCount = async (userId: string | number) => {
  const targetUserId = toBigIntId(userId, "userId");
  return prisma.notify.count({
    where: { receiveId: targetUserId, isRead: false },
  });
};

const markRead = async (
  notifyId: string | number,
  userId: string | number,
) => {
  const id = toBigIntId(notifyId, "notifyId");
  const receiveId = toBigIntId(userId, "userId");
  const result = await prisma.notify.updateMany({
    where: { id, receiveId },
    data: {
      isRead: true,
      updateTime: BigInt(Date.now()),
    },
  });
  return result.count > 0;
};

const markAllRead = async (userId: string | number) => {
  const receiveId = toBigIntId(userId, "userId");
  const result = await prisma.notify.updateMany({
    where: { receiveId, isRead: false },
    data: {
      isRead: true,
      updateTime: BigInt(Date.now()),
    },
  });
  return result.count;
};

const sendNotifyToUsers = async (params: {
  sendId: string | number;
  receiveIds: Array<string | number>;
  notifyType?: string;
  notifyMsg: string;
}) => {
  const { sendId, receiveIds, notifyMsg } = params;
  const notifyType = params.notifyType || "system";
  const uniqueIds = [...new Set((receiveIds || []).map(String).filter(Boolean))];
  const created: ReturnType<typeof formatNotify>[] = [];
  for (const rid of uniqueIds) {
    const row = await addNotify(sendId, rid, notifyType, notifyMsg);
    created.push(formatNotify(row as NotifyRow));
  }
  return created;
};

export default {
  addNotify,
  queryNotifyById,
  queryNotifyByType,
  queryMyNotifyByType,
  queryAllNotify,
  queryMyAllNotify,
  getUnreadCount,
  markRead,
  markAllRead,
  sendNotifyToUsers,
};
