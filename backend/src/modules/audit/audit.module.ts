import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditController } from "./audit.controller";
import { ApiErrorAuditInterceptor } from "./api-error-audit.interceptor";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditService } from "./audit.service";

@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiErrorAuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}