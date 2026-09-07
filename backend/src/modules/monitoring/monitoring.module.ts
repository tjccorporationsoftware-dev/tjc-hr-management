import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../../database/prisma.module";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { HttpMetricsService } from "./http-metrics.service";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  imports: [PrismaModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    HttpMetricsService,
    // นับทุกคำขอเข้า metric — ลงทะเบียนแบบ global ผ่าน DI เพื่อให้ฉีด service ได้
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [HttpMetricsService],
})
export class MonitoringModule {}
