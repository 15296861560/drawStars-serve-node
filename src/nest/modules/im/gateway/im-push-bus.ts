import { Injectable } from "@nestjs/common";
import { EventEmitter } from "events";
import { publish, subscribe } from "../im-redis";

/**
 * ImPushBus：消息推送总线。
 * - 进程内 EventEmitter（单节点）
 * - 可选 Redis Pub/Sub 扇出（多节点，订阅 channel im:push）
 * ImMessageService 落库成功后调用 publish；ImWsGateway 订阅后向在线连接投递。
 */
export interface PushMessage {
  conversationId: string;
  convType: string;
  envelope: Record<string, unknown>; // 含 msgId/seq/senderId/content...
  /** 仅投递给这些 uid（如 C2C 对端 + 在房成员）；空=按订阅投递 */
  targetUids?: string[];
}

export const IM_PUSH_CHANNEL = "im:push";
export const IM_PRESENCE_CHANNEL = "im:presence";

@Injectable()
export class ImPushBus extends EventEmitter {
  private multiNode = false;

  async initMultiNode() {
    if (this.multiNode) return;
    this.multiNode = true;
    await subscribe(IM_PUSH_CHANNEL, (msg) => {
      try {
        const parsed = JSON.parse(msg) as PushMessage;
        this.emit("push", parsed);
      } catch {
        /* ignore */
      }
    });
  }

  /** 发布消息推送（落库后调用） */
  async publishMessage(payload: PushMessage) {
    this.emit("push", payload);
    if (this.multiNode) {
      await publish(IM_PUSH_CHANNEL, JSON.stringify(payload));
    }
  }

  /** 发布系统事件推送（好友申请/被踢等） */
  async publishEvent(targetUid: string, event: string, data: Record<string, unknown>) {
    const envelope = { event, ts: Date.now(), data };
    this.emit("event", { targetUid, envelope });
    // 多节点时事件也走广播，由各节点判断 uid 是否在本节点
    if (this.multiNode) {
      await publish(IM_PRESENCE_CHANNEL, JSON.stringify({ targetUid, envelope }));
    }
  }
}
