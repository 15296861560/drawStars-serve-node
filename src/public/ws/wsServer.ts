import WebSocket from "ws";
import config from "../../config/publish-config";

const port = config.ws_port;

const ws = new WebSocket.Server({ port }, () => {
  console.log(`websocket run port ${port}`);
});

ws.on("connection", (client) => {
  client.send("连接WebSocket成功");
  client.on("message", (msg) => {
    console.log("来自前端的数据：" + msg);
    client.send("服务端发送的信息：" + new Date().toLocaleString());
  });

  client.on("close", () => {
    console.log("前端主动断开了链接：");
  });
});
