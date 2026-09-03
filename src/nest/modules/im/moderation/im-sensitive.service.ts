import { Injectable } from "@nestjs/common";
import { prisma } from "../../../../lib/prisma";

/**
 * 敏感词服务：加载词库（短缓存）+ 命中拦截。
 */
@Injectable()
export class ImSensitiveService {
  private words: string[] = [];
  private loadedAt = 0;
  private readonly cacheTtlMs = 30 * 1000;

  private async load() {
    if (this.words.length && Date.now() - this.loadedAt < this.cacheTtlMs) return;
    const rows = await prisma.imSensitiveWord.findMany();
    this.words = rows.map((r) => r.word).filter(Boolean);
    this.loadedAt = Date.now();
  }

  async reload() {
    this.loadedAt = 0;
    await this.load();
  }

  /** 命中返回首个敏感词，否则 null */
  async hit(text: string): Promise<string | null> {
    if (!text) return null;
    await this.load();
    for (const w of this.words) {
      if (w && text.includes(w)) return w;
    }
    return null;
  }
}
