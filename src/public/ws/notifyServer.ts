import notifyServer from "drawstarts-notify-serve";
import config from "../../config/publish-config";
import Log from "../provider/log";
import Notify from "../provider/notify";
import { verifyToken } from "../provider/tokenVerify";

const port = config.notify_port;

notifyServer.init({
  config: { port },
  verifyToken,
  addLog: (...args: unknown[]) =>
    Log.addLog(
      args[0] as string,
      args[1] as string,
      args[2] as string,
      args[3],
    ),
  addNotify: Notify.addNotify,
});
