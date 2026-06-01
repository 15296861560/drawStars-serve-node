import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeBigInt } from "../lib/serialize";

export async function rawQuery<T = unknown>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await prisma.$queryRawUnsafe<T[]>(query, ...params);
  return serializeBigInt(result) as T[];
}

export { Prisma };
