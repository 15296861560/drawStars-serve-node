import { createClient, type RedisClientType } from "redis";
import config from "./publish-config";
import Log from "../public/provider/log";

const port = config.redis_port;
const ip = "127.0.0.1";

const redisClient: RedisClientType = createClient({
  url: `redis://${ip}:${port}`,
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
