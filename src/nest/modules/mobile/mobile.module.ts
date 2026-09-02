import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";
import { MobileP1Service } from "./mobile-p1.service";

@Module({
  imports: [RbacModule],
  controllers: [MobileController],
  providers: [MobileService, MobileP1Service],
  exports: [MobileService, MobileP1Service],
})
export class MobileModule {}
