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
      notifyMsg: Buffer.from(notifyMsg),
      createTime: BigInt(curTime),
      updateTime: BigInt(curTime),
      createBy: sendUserId,
      updateBy: sendUserId,
    },
  });
};

const queryNotifyById = async (notify_id: string | number) => {
  const notifyId = toBigIntId(notify_id, "notifyId");
  const rows = await prisma.notify.findMany({
    where: { id: notifyId },
  });
  return serializeBigInt(rows);
};

const queryNotifyByType = async (notifyType: string) => {
  const rows = await prisma.notify.findMany({
    where: { notifyType },
  });
  return serializeBigInt(rows);
};

const queryMyNotifyByType = async (notifyType: string, userId: string | number) => {
  const targetUserId = toBigIntId(userId, "userId");
  const rows = await prisma.notify.findMany({
    where: { notifyType, receiveId: targetUserId },
  });
  return serializeBigInt(rows);
};

const queryAllNotify = async () => {
  const rows = await prisma.notify.findMany();
  return serializeBigInt(rows);
};

const queryMyAllNotify = async (userId: string | number) => {
  const targetUserId = toBigIntId(userId, "userId");
  const rows = await prisma.notify.findMany({
    where: { receiveId: targetUserId },
  });
  return serializeBigInt(rows);
};

export default {
  addNotify,
  queryNotifyById,
  queryNotifyByType,
  queryMyNotifyByType,
  queryAllNotify,
  queryMyAllNotify,
};
