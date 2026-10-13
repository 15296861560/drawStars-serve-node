/**
 * 星会小游戏抽题：真话大冒险 / 你画我猜 / 瞎掰王 / 掷骰子
 * - 全部 200 裸回包，形状对齐小程序 mock（端点 #9-#12）
 */
import { Injectable } from '@nestjs/common'
import { createTodDealer } from './data/tod'
import { DRAW_THEMES, pickDrawWord } from './data/draw-words'
import { pickBluffPrompt } from './data/bluff-prompts'
import { clampInt, gatherList, parseBodyList } from './party.util'

const DEALER_CAP = 80

@Injectable()
export class PartyGamesService {
  /** 每个观众独立的真话/大冒险发题器（防连重状态在内存维持） */
  private readonly todDealers = new Map<
    string,
    { next: (opts: { level?: unknown; kind?: unknown; themeTags?: unknown }) => Record<string, unknown> }
  >()

  private dealerOf(clientKey: string) {
    let dealer = this.todDealers.get(clientKey)
    if (!dealer) {
      dealer = createTodDealer(clientKey) as never
      this.todDealers.set(clientKey, dealer)
      // 容量保护：FIFO 驱逐最早使用者
      while (this.todDealers.size > DEALER_CAP) {
        const oldest = this.todDealers.keys().next().value
        if (oldest === undefined) break
        this.todDealers.delete(oldest)
      }
    }
    return dealer
  }

  /** POST /games/tod/draw → {kind,level,themes,text} */
  todDraw(body: Record<string, unknown> | null | undefined, clientKey: string) {
    const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const dealer = this.dealerOf(clientKey)
    const picked = dealer.next({
      level: src.level,
      kind: src.kind,
      themeTags: parseBodyList(src.themeTags),
    })
    const out = (picked || {}) as {
      kind?: unknown
      level?: unknown
      themes?: unknown
      text?: unknown
    }
    return {
      kind: typeof out.kind === 'string' ? out.kind : 'truth',
      level: typeof out.level === 'string' ? out.level : 'gentle',
      themes: Array.isArray(out.themes) ? out.themes : [],
      text: typeof out.text === 'string' ? out.text : '',
    }
  }

  /** GET /games/draw/words → {word,theme,level} */
  drawWords(query: Record<string, unknown> | null | undefined) {
    const q = query || {}
    // data/draw-words.js 与小程序字节级一致、不可改；服务端兜底在调用前完成：
    // 1) 滤掉词库不存在的非法主题键（如 ?themes=脑洞）
    // 2) 剩空传 undefined，让 pickDrawWord 回退全量 DRAW_THEMES
    // 保住「一切 200 裸回包 + word/theme/level 三字段必回」的契约。
    const themes = gatherList(q, 'themes').filter((t) => DRAW_THEMES.includes(t))
    return pickDrawWord({
      themes: themes.length ? themes : undefined,
      level: typeof q.level === 'string' ? q.level : '',
      exclude: gatherList(q, 'exclude'),
    }) as { word: string; theme: string; level: string }
  }

  /** GET /games/bluff/prompts → {id,emoji,prompt,bluffDefault,botAnswers} */
  bluffPrompts(query: Record<string, unknown> | null | undefined) {
    return pickBluffPrompt(gatherList(query || {}, 'excludeIds')) as unknown as {
      botAnswers?: unknown
      [key: string]: unknown
    }
  }

  /** POST /games/dice/shake → {dices:[...]}（clamp 1-10，默认 5） */
  diceShake(body: Record<string, unknown> | null | undefined) {
    const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const count = clampInt(src.count, 1, 10, 5)
    const dices: number[] = []
    for (let i = 0; i < count; i += 1) {
      dices.push(1 + Math.floor(Math.random() * 6))
    }
    return { dices }
  }
}
