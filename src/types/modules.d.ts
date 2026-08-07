declare module "drawstarts-notify-serve" {
  interface ExternalConfig {
    port?: number;
    httpPort?: number;
    staticDir?: string;
    maxPayload?: number;
    maxConnections?: number;
    heartbeatInterval?: number;
    heartbeatTimeout?: number;
    rateLimitWindowMs?: number;
    rateLimitMax?: number;
    allowedOrigins?: string[];
    enableOffline?: boolean;
    historyLimit?: number;
    offlineLimit?: number;
    multiDevicePolicy?: string;
    adminToken?: string;
    requireAck?: boolean;
  }

  interface NotifyServerInit {
    config?: ExternalConfig;
    verifyToken: (token: string) => unknown | Promise<unknown>;
    addLog?: (
      type: string,
      hostname: string,
      originalUrl: string,
      content: string,
    ) => unknown | Promise<unknown>;
    addNotify?: (
      sendId: string,
      receiveId: string,
      notifyType: string,
      notifyMsg: string,
      messageId?: string,
    ) => unknown | Promise<unknown>;
    logger?: (
      level: string,
      message: string,
      meta?: Record<string, unknown>,
    ) => void;
  }

  interface NotifyServerInstance {
    init(options?: NotifyServerInit): void;
    notify(options: Record<string, unknown>): Promise<unknown>;
    kick(clientId: string, reason?: string): boolean;
    broadcastSys(event: string, data?: unknown): number;
    getStats(): Record<string, unknown>;
    getMetrics(): Record<string, unknown>;
    close(): Promise<void>;
  }

  const notifyServer: NotifyServerInstance;
  export default notifyServer;
  export { NotifyServerInstance as NotifyServer };
}

declare module "alipay-sdk/lib/form" {
  export default class AlipayFormData {
    setMethod(method: string): void;
    addField(name: string, value: unknown): void;
  }
}
