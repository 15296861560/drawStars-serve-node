declare module "drawstarts-notify-serve" {
  interface NotifyServerInit {
    config: { port: number };
    verifyToken: (token: string) => unknown;
    addLog: (...args: unknown[]) => void;
    addNotify: (
      sendId: string | number,
      receiveId: string | number,
      notifyType: string,
      notifyMsg: string,
    ) => Promise<unknown>;
  }
  function init(options: NotifyServerInit): void;
  export default { init };
}

declare module "alipay-sdk/lib/form" {
  export default class AlipayFormData {
    setMethod(method: string): void;
    addField(name: string, value: unknown): void;
  }
}
