import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessControlService } from "./access-control.service";
import { PermissionsController } from "./permissions.controller";
import { RolesController } from "./roles.controller";

@Module({
  imports: [AuthModule],
  controllers: [PermissionsController, RolesController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}