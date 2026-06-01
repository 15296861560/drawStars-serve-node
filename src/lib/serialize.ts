/** Convert Prisma BigInt fields for JSON responses */
export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? Number(val) : val,
    ),
  ) as T;
}
