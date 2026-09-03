import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ImConversationService } from "../conversation/im-conversation.service";
import { serializeBigInt } from "../../../../lib/serialize";

@Controller("im/conversations")
export class ImConversationController {
  constructor(private readonly convService: ImConversationService) {}

  @Get()
  async list(@Req() req: any, @Query("curPage") curPage = "1", @Query("pageSize") pageSize = "50") {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.listConversations(uid, Number(curPage), Number(pageSize));
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Get(":id/messages")
  async messages(
    @Req() req: any,
    @Param("id") id: string,
    @Query("beforeSeq") beforeSeq?: string,
    @Query("limit") limit = "20",
  ) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.listMessages(id, uid, beforeSeq ? Number(beforeSeq) : undefined, Number(limit));
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Get(":id/messages/sync")
  async sync(@Req() req: any, @Param("id") id: string, @Query("afterSeq") afterSeq: string, @Query("limit") limit = "50") {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.syncMessages(id, uid, Number(afterSeq), Number(limit));
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":id/read")
  async read(@Req() req: any, @Param("id") id: string, @Body() body: { seq: number }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.markRead(id, uid, Number(body.seq));
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":id/pin")
  async pin(@Req() req: any, @Param("id") id: string, @Body() body: { pinned: boolean }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.pin(id, uid, body.pinned);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":id/mute")
  async mute(@Req() req: any, @Param("id") id: string, @Body() body: { muted: boolean }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.mute(id, uid, body.muted);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":id/draft")
  async draft(@Req() req: any, @Param("id") id: string, @Body() body: { draft: string }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.saveDraft(id, uid, body.draft || "");
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":id/delete")
  async delete(@Req() req: any, @Param("id") id: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.convService.deleteConversation(id, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }
}
