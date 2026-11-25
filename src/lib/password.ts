import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback)
const HASH_PREFIX = 'scrypt'
const KEY_LENGTH = 64

/** 生成 scrypt 密码哈希，格式：scrypt$<salt hex>$<hash hex> */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer
  return `${HASH_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`
}

/** 是否已是哈希格式（用于识别存量明文密码） */
export function isHashedPassword(stored?: string | null): boolean {
  return typeof stored === 'string' && stored.startsWith(`${HASH_PREFIX}$`)
}

/** 校验密码：兼容存量明文，匹配后由调用方触发懒迁移 */
export async function verifyPassword(
  plain: string,
  stored?: string | null
): Promise<boolean> {
  if (!stored) return false
  if (!isHashedPassword(stored)) {
    return plain === stored
  }

  const [, saltHex, hashHex] = stored.split('$')
  if (!saltHex || !hashHex) return false

  const derived = (await scrypt(
    plain,
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH
  )) as Buffer
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== derived.length) return false
  return timingSafeEqual(derived, expected)
}
