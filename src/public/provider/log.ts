import { prisma } from "../../lib/prisma";

export const LOG_TYPE = {
  API: "api",
  REDIS: "redis",
  OPERATE: "operate",
} as const;

const MAX_LOG = 100;
const SAVE_LOG_TIME = 60 * 1000;
const TYPE_MAX_LENGTH = 32;
const URL_MAX_LENGTH = 255;

interface LogRecord {
  log_type: string;
  hostname: string;
  originalUrl: string;
  createTime: number;
  content: string;
}

let records: LogRecord[] = [];

setInterval(() => {
  if (records.length > 0) {
    batchSaveLogs(records).catch((e) =>
      console.error("[log] batchSaveLogs failed:", e),
    );
  }
}, SAVE_LOG_TIME);

async function batchSaveLogs(logRecords: LogRecord[]) {
  await prisma.log.createMany({
    data: logRecords.map((record) => ({
      logType: record.log_type,
      hostname: record.hostname,
      originalUrl: record.originalUrl,
      createTime: BigInt(record.createTime),
      content: record.content,
    })),
  });
  logRecords.length = 0;
}

function addLog(
  type: string,
  hostname = "",
  originalUrl = "",
  content: unknown,
) {
  const nowDate = new Date().getTime();
  const saveData: LogRecord = {
    log_type: type.slice(0, TYPE_MAX_LENGTH),
    hostname: hostname.slice(0, URL_MAX_LENGTH),
    originalUrl: originalUrl.slice(0, URL_MAX_LENGTH),
    createTime: nowDate,
    content: JSON.stringify(content),
  };
  records.push(saveData);
  if (records.length >= MAX_LOG) {
    batchSaveLogs(records).catch((e) =>
      console.error("[log] batchSaveLogs failed:", e),
    );
  }
}

function saveLog(saveData: {
  log_type: string;
  hostname: string;
  originalUrl: string;
  createTime: number;
  content: string;
}) {
  prisma.log
    .create({
      data: {
        logType: saveData.log_type,
        hostname: saveData.hostname,
        originalUrl: saveData.originalUrl,
        createTime: BigInt(saveData.createTime),
        content: saveData.content,
      },
    })
    .catch(console.log);
}

function clearLog() {
  batchSaveLogs(records);
}

function queryLogById(log_id: number | string) {
  prisma.log
    .findMany({ where: { logId: BigInt(log_id) } })
    .then((r) => console.log("querySingleLog", r));
}

function queryLogByType() {
  prisma.log.findMany().then((r) => console.log("queryLogByType", r));
}

function queryAllLog() {
  prisma.log.findMany().then((r) => console.log("queryAllLog", r));
}

export default {
  addLog,
  saveLog,
  clearLog,
  queryLogById,
  queryLogByType,
  queryAllLog,
  LOG_TYPE,
};
