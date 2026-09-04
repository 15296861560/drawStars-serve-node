import { Injectable } from '@nestjs/common'
import { prisma } from '../../lib/prisma'

@Injectable()
export class PrismaService {
  readonly client = prisma
}
