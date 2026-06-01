import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async queryUserInfo(id: number) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        name: true,
        introduction: true,
        birthday: true,
        region: true,
        gender: true,
        phone: true,
      },
    });
    return user;
  }

  async updateUserInfo(
    id: number,
    payload: Partial<{
      name: string;
      introduction: string;
      birthday: string;
      region: string;
      gender: string;
      phone: string;
      password: string;
    }>,
  ) {
    return this.prisma.client.user.update({
      where: { id: BigInt(id) },
      data: {
        ...payload,
        updateTime: BigInt(Date.now()),
      },
    });
  }

  async changePassword(id: number, password: string, newPassword: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: BigInt(id) },
      select: { password: true },
    });
    if (!user || user.password !== password) {
      return false;
    }
    await this.updateUserInfo(id, { password: newPassword });
    return true;
  }
}
