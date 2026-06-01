import type { RedisClientType } from "redis";

declare global {
  // eslint-disable-next-line no-var
  var redisClient: RedisClientType;
}

export {};
