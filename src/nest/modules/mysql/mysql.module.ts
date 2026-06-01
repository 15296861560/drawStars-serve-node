import { Module } from "@nestjs/common";
import { MysqlController } from "./mysql.controller";
import { MysqlService } from "./mysql.service";

@Module({
  controllers: [MysqlController],
  providers: [MysqlService],
})
export class MysqlModule {}
