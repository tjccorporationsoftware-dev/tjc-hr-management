import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { RateLimitService } from "../../common/services/rate-limit.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PermissionGuard,
    RateLimitGuard,
    RateLimitService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    PermissionGuard,
    RateLimitGuard,
    RateLimitService,
    JwtModule,
  ],
})
export class AuthModule {}