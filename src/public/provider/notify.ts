import { prisma } from "../../lib/prisma";
import { serializeBigInt } from "../../lib/serialize";

const addNotify = async (
  sendId: string | number,
  receiveId: string | number,
  notifyType: string,
  notifyMsg: string,
) => {
  const curTime = new Date().getTime();
  return prisma.notify.create({
    data: {
      sendId: BigInt(sendId),
      receiveId: BigInt(receiveId),
      notifyType,
      notifyMsg: Buffer.from(notifyMsg),
      createTime: BigInt(curTime),
      updateTime: BigInt(curTime),
      createBy: BigInt(sendId),
      updateBy: BigInt(sendId),
    },
  });
};

const queryNotifyById = async (notify_id: string | number) => {
  const rows = await prisma.notify.findMany({
    where: { id: BigInt(notify_id) },
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
  const rows = await prisma.notify.findMany({
    where: { notifyType, receiveId: BigInt(userId) },
  });
  return serializeBigInt(rows);
};

const queryAllNotify = async () => {
  const rows = await prisma.notify.findMany();
  return serializeBigInt(rows);
};

const queryMyAllNotify = async (userId: string | number) => {
  const rows = await prisma.notify.findMany({
    where: { receiveId: BigInt(userId) },
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
