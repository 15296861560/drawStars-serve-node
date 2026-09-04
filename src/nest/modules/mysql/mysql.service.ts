import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { rawQuery } from '../../../db/raw-query'

@Injectable()
export class MysqlService {
  constructor(private readonly prisma: PrismaService) {}

  async login(name: string, password: string) {
    const users = await this.prisma.client.user.findMany({ where: { name } })
    if (users.length === 0) {
      return { status: true, msg: '账号不存在', data: null }
    }
    if (password !== users[0].password) {
      return { status: true, msg: '密码错误', data: null }
    }
    return { status: true, msg: '登录成功', data: users[0] }
  }

  async register(payload: { name: string; password: string; phone: string }) {
    const now = Date.now()
    const result = await this.prisma.client.user.create({
      data: {
        name: payload.name,
        password: payload.password,
        phone: payload.phone,
        createTime: BigInt(now),
        updateTime: BigInt(now),
        level: 1
      }
    })
    return { status: true, msg: '注册成功', data: result }
  }

  async cancel(phone: string) {
    await this.prisma.client.user.delete({ where: { phone } })
    return { status: true, msg: '删除成功', data: null }
  }

  async modify(phone: string, pwd: string) {
    await this.prisma.client.user.update({
      where: { phone },
      data: { password: pwd, updateTime: BigInt(Date.now()) }
    })
    return { status: true, msg: '修改成功', data: null }
  }

  async query() {
    const rows = await this.prisma.client.user.findMany({
      select: { id: true, name: true, level: true, phone: true }
    })
    return { status: true, msg: '查询成功', data: rows }
  }

  async sql(sql: string, values: unknown[]) {
    const rows = await rawQuery(sql, values)
    return { status: true, msg: '执行成功', data: rows }
  }
}
