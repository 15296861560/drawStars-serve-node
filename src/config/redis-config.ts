import { createClient, type RedisClientType } from "redis";
import config from "./publish-config";
import Log from "../public/provider/log";

const port = config.redis_port;
const host = config.redis_host;

const redisClient: RedisClientType = createClient({
  url: `redis://${host}:${port}`,
});

redisClient.on("ready", () => {
  Log.addLog(Log.LOG_TYPE.REDIS, Log.LOG_TYPE.REDIS, Log.LOG_TYPE.REDIS, {
    methods: "ready",
  });
});

redisClient.on("error", (err) => {
  Log.addLog(Log.LOG_TYPE.REDIS, Log.LOG_TYPE.REDIS, Log.LOG_TYPE.REDIS, {
    err,
    methods: "error",
  });
});

redisClient.connect();
global.redisClient = redisClient;

export default redisClient;
