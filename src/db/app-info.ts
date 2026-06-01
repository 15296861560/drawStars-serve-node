import { prisma } from "../lib/prisma";
import { serializeBigInt } from "../lib/serialize";

export interface AppInfoRecord {
  app_name: string;
  app_id: string | null;
  app_certificate: string | null;
  app_version: string | null;
}

export async function getAppInfo(appName: string): Promise<AppInfoRecord | null> {
  const row = await prisma.appInfo.findUnique({
    where: { appName },
  });

  if (!row) {
    console.log("无该app信息");
    return null;
  }

  return serializeBigInt({
    app_name: row.appName,
    app_id: row.appId,
    app_certificate: row.appCertificate,
    app_version: row.appVersion,
  });
}
