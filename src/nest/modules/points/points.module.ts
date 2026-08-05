import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { PointsController } from "./points.controller";
import { PointsService } from "./points.service";

@Module({
  imports: [RbacModule],
  controllers: [PointsController],
  providers: [PointsService],
  exports: [PointsService],
})
export class PointsModule {}
