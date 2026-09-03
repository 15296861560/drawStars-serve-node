import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";
import { serializeBigInt } from "../../../../lib/serialize";

const DEFAULTS: Record<string, string> = {
  freqPerSec: "5",
  freqPerMin: "60",
  createRoomPerDay: "3",
  roomHistoryRetainDays: "7",
  groupHistoryRetainDays: "180",
  strangerPerDayUsers: "5",
  strangerPerDayMsgs: "10",
};

@Injectable()
export class ImSettingsService {
  async list() {
    const rows = await prisma.imSetting.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const r of rows) map[r.key] = r.value || "";
    return map;
  }

  async update(key: string, value: string) {
    const row = await prisma.imSetting.upsert({
      where: { key },
      create: { key, value, updatedAt: BigInt(Date.now()) },
      update: { value, updatedAt: BigInt(Date.now()) },
    });
    return serializeBigInt(row);
  }

  async bulkUpdate(items: Record<string, string>) {
    const out: unknown[] = [];
    for (const [k, v] of Object.entries(items)) {
      out.push(await this.update(k, String(v)));
    }
    return out;
  }
}
