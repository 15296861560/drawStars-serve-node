import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ImRoomService } from "./im-room.service";
import { serializeBigInt } from "../../../../lib/serialize";

@Controller("im/rooms")
export class ImRoomController {
  constructor(private readonly roomService: ImRoomService) {}

  @Post()
  async create(@Req() req: any, @Body() body: Record<string, unknown>) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.create(uid, body);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Get(":roomId")
  async get(@Param("roomId") roomId: string, @Req() req: any) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.get(roomId, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId")
  async update(@Req() req: any, @Param("roomId") roomId: string, @Body() body: Record<string, unknown>) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.update(roomId, uid, body);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/publish")
  async publish(@Req() req: any, @Param("roomId") roomId: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.publish(roomId, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/join")
  async join(@Req() req: any, @Param("roomId") roomId: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.join(roomId, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/leave")
  async leave(@Req() req: any, @Param("roomId") roomId: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.leave(roomId, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Get(":roomId/members")
  async members(@Param("roomId") roomId: string) {
    const data = await this.roomService.members(roomId);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/mute")
  async mute(@Req() req: any, @Param("roomId") roomId: string, @Body() body: { targetUserId: string; duration: "10min" | "1h" | "permanent" }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.mute(roomId, uid, body.targetUserId, body.duration);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/kick")
  async kick(@Req() req: any, @Param("roomId") roomId: string, @Body() body: { targetUserId: string }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.kick(roomId, uid, body.targetUserId);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/admins")
  async setAdmin(@Req() req: any, @Param("roomId") roomId: string, @Body() body: { targetUserId: string; isAdmin: boolean }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.setAdmin(roomId, uid, body.targetUserId, body.isAdmin);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/transfer")
  async transfer(@Req() req: any, @Param("roomId") roomId: string, @Body() body: { targetUserId: string }) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.transfer(roomId, uid, body.targetUserId);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/close")
  async close(@Req() req: any, @Param("roomId") roomId: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.close(roomId, uid);
    return { status: true, msg: "ok", data: serializeBigInt(data) };
  }

  @Post(":roomId/presence")
  async presence(@Req() req: any, @Param("roomId") roomId: string) {
    const uid = String(req.auth?.uid ?? "");
    const data = await this.roomService.heartbeat(roomId, uid);
    return { status: true, msg: "ok", data };
  }
}
