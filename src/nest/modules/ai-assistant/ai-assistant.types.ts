export type AiMessageRole = "user" | "assistant" | "system";

export type AiMessageType =
  | "text"
  | "rich"
  | "voice"
  | "file"
  | "table"
  | "chart";

export type AiConversationGroup = "today" | "yesterday" | "earlier";

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  type: AiMessageType;
  content: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  capabilityId?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  group: AiConversationGroup;
  preview: string;
  updatedAt: string;
  messageCount: number;
}

export interface AiChatRequest {
  conversationId?: string;
  content: string;
  type?: AiMessageType;
  fileExcerpt?: string;
}

export interface AiChatResponse {
  userMessage: AiMessage;
  assistantMessage: AiMessage;
}

export interface CreateConversationDto {
  title?: string;
}
