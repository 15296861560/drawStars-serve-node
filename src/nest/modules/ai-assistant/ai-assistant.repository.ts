import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  AiConversation,
  AiConversationGroup,
  AiMessage,
} from "./ai-assistant.types";

function conversationGroup(updatedAt: Date): AiConversationGroup {
  const d = updatedAt;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday.getTime() - 86400000);
  if (d >= startToday) return "today";
  if (d >= startYesterday) return "yesterday";
  return "earlier";
}

function mapMessage(row: {
  id: string;
  conversationId: string;
  role: string;
  type: string;
  content: string;
  payload: Prisma.JsonValue;
  capabilityId: string | null;
  createdAt: Date;
}): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as AiMessage["role"],
    type: row.type as AiMessage["type"],
    content: row.content,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : undefined,
    capabilityId: row.capabilityId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AiAssistantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(userKey: string): Promise<AiConversation[]> {
    const rows = await this.prisma.client.aiConversation.findMany({
      where: { userKey },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return rows.map((row) => {
      const last = row.messages[0];
      return {
        id: row.id,
        title: row.title,
        group: conversationGroup(row.updatedAt),
        preview: last
          ? last.content.replace(/<[^>]+>/g, "").slice(0, 40)
          : "",
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row._count.messages,
      };
    });
  }

  async getConversation(
    userKey: string,
    conversationId: string,
  ): Promise<AiConversation | null> {
    const row = await this.prisma.client.aiConversation.findFirst({
      where: { id: conversationId, userKey },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    if (!row) return null;

    const last = row.messages[0];
    return {
      id: row.id,
      title: row.title,
      group: conversationGroup(row.updatedAt),
      preview: last
        ? last.content.replace(/<[^>]+>/g, "").slice(0, 40)
        : "",
      updatedAt: row.updatedAt.toISOString(),
      messageCount: row._count.messages,
    };
  }

  async createConversation(
    userKey: string,
    title = "新对话",
  ): Promise<AiConversation> {
    const row = await this.prisma.client.aiConversation.create({
      data: { userKey, title },
    });
    return {
      id: row.id,
      title: row.title,
      group: conversationGroup(row.updatedAt),
      preview: "",
      updatedAt: row.updatedAt.toISOString(),
      messageCount: 0,
    };
  }

  async assertConversation(userKey: string, conversationId: string) {
    const row = await this.prisma.client.aiConversation.findFirst({
      where: { id: conversationId, userKey },
    });
    if (!row) {
      throw new NotFoundException("对话不存在");
    }
    return row;
  }

  async getMessages(
    userKey: string,
    conversationId: string,
  ): Promise<AiMessage[]> {
    await this.assertConversation(userKey, conversationId);
    const rows = await this.prisma.client.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapMessage);
  }

  async saveMessage(
    conversationId: string,
    data: Omit<AiMessage, "id" | "createdAt">,
  ): Promise<AiMessage> {
    const row = await this.prisma.client.aiMessage.create({
      data: {
        conversationId,
        role: data.role,
        type: data.type,
        content: data.content,
        payload: data.payload
          ? (data.payload as Prisma.InputJsonValue)
          : undefined,
        capabilityId: data.capabilityId,
      },
    });

    await this.prisma.client.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return mapMessage(row);
  }

  async touchConversation(
    conversationId: string,
    opts?: { title?: string; preview?: string },
  ) {
    await this.prisma.client.aiConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        ...(opts?.title ? { title: opts.title } : {}),
      },
    });
  }
}
