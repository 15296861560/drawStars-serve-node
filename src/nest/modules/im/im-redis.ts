/**
 * IM Redis 工具：直接使用 global.redisClient；Redis 未就绪时降级为进程内内存（仅单节点开发）。
 */
const memStore = new Map<string, string>()
const memSets = new Map<string, Set<string>>()

function client() {
  const c = global.redisClient
  if (!c) return null
  // 必须同时满足 isOpen（客户端已初始化）且 isReady（已连上可执行命令），
  // 否则命令会排队等待连接，导致接口超时。未就绪时降级为进程内内存。
  const isOpen = (c as unknown as { isOpen?: boolean }).isOpen === true
  const isReady = (c as unknown as { isReady?: boolean }).isReady === true
  return isOpen && isReady ? c : null
}

export async function setEx(key: string, value: string, ttlSec: number) {
  const c = client()
  if (c) {
    await c.set(key, value, { EX: ttlSec })
    return
  }
  memStore.set(key, value)
  setTimeout(() => memStore.delete(key), ttlSec * 1000)
}

export async function get(key: string): Promise<string | null> {
  const c = client()
  if (c) return (await c.get(key)) ?? null
  return memStore.get(key) ?? null
}

export async function del(key: string) {
  const c = client()
  if (c) {
    await c.del(key)
    return
  }
  memStore.delete(key)
}

/** 单次消费：存在则删除并返回原值 */
export async function consume(key: string): Promise<string | null> {
  const c = client()
  if (c) {
    const val = await c.get(key)
    if (val != null) await c.del(key)
    return val ?? null
  }
  const v = memStore.get(key) ?? null
  memStore.delete(key)
  return v
}

export async function incr(key: string, ttlSec: number): Promise<number> {
  const c = client()
  if (c) {
    const n = await c.incr(key)
    if (n === 1) await c.expire(key, ttlSec)
    return n
  }
  const cur = Number(memStore.get(key) || 0) + 1
  memStore.set(key, String(cur))
  setTimeout(() => memStore.delete(key), ttlSec * 1000)
  return cur
}

// Set 操作（房间在线人数）
export async function sAdd(key: string, member: string) {
  const c = client()
  if (c) {
    await c.sAdd(key, member)
    return
  }
  if (!memSets.has(key)) memSets.set(key, new Set())
  memSets.get(key)!.add(member)
}

export async function sRem(key: string, member: string) {
  const c = client()
  if (c) {
    await c.sRem(key, member)
    return
  }
  memSets.get(key)?.delete(member)
}

export async function sCard(key: string): Promise<number> {
  const c = client()
  if (c) return await c.sCard(key)
  return memSets.get(key)?.size ?? 0
}

export async function sMembers(key: string): Promise<string[]> {
  const c = client()
  if (c) return await c.sMembers(key)
  return Array.from(memSets.get(key) ?? [])
}

// Pub/Sub（多节点扇出）
export async function publish(channel: string, message: string) {
  const c = client()
  if (c) {
    await c.publish(channel, message)
  }
}

export async function subscribe(
  channel: string,
  cb: (message: string) => void
) {
  const c = client()
  if (!c) return
  await c.subscribe(channel, msg => cb(String(msg)))
}
