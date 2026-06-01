import Log from "../../provider/log";

class RedisClient {
  getClient() {
    return global.redisClient;
  }

  addLog(method: string, key: string, res: unknown) {
    const type = Log.LOG_TYPE.REDIS;
    Log.addLog(type, type, type, {
      key,
      res,
      methods: method,
    });
  }

  async set(key: string, val: string) {
    const res = await global.redisClient.set(key, val);
    this.addLog("set", key, res);
    return res;
  }

  async get(key: string) {
    const value = await global.redisClient.get(key);
    this.addLog("get", key, value);
    return value;
  }

  async del(key: string) {
    const value = await global.redisClient.del(key);
    this.addLog("del", key, value);
    return value;
  }

  async expire(key: string, seconds: number) {
    const value = await global.redisClient.expire(key, seconds);
    this.addLog("expire", key, value);
    return value;
  }

  async exists(key: string) {
    const value = await global.redisClient.exists(key);
    this.addLog("exists", key, value);
    return value;
  }

  async quit() {
    const res = await global.redisClient.quit();
    this.addLog("quit", "quit", res);
    return res;
  }

  async disconnect() {
    const res = await global.redisClient.disconnect();
    this.addLog("disconnect", "disconnect", res);
    return res;
  }
}

export default new RedisClient();
