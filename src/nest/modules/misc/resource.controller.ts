import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { serializeBigInt } from '../../../lib/serialize'

@Controller('resourceApi')
export class ResourceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('getPovinceList')
  async getPovinceList() {
    const rows = await this.prisma.client.province.findMany({
      where: { city: '0' }
    })
    return serializeBigInt(rows)
  }

  @Get('getCityList')
  async getCityList(@Query('province') province: string) {
    const rows = await this.prisma.client.province.findMany({
      where: { province, area: '0', NOT: { city: '0' } }
    })
    return serializeBigInt(rows)
  }

  @Get('getAreaList')
  async getAreaList(
    @Query('province') province: string,
    @Query('city') city: string
  ) {
    const rows = await this.prisma.client.province.findMany({
      where: { province, city, town: '0', NOT: { area: '0' } }
    })
    return serializeBigInt(rows)
  }

  @Get('getTownList')
  async getTownList(
    @Query('province') province: string,
    @Query('city') city: string,
    @Query('area') area: string
  ) {
    const rows = await this.prisma.client.province.findMany({
      where: { province, city, area, NOT: { town: '0' } }
    })
    return serializeBigInt(rows)
  }
}
