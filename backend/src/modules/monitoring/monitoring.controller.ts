import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { Auth } from "../../common/decorators/auth.decorator";
import { MonitoringService } from "./monitoring.service";

@Controller("monitoring")
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly configService: ConfigService,
  ) {}

  @Get("health")
  getHealth() {
    return this.monitoringService.getHealth();
  }

  /**
   * ใช้เป็น readiness probe ของ load balancer / orchestrator
   *
   * ต้องตอบด้วย HTTP status ไม่ใช่แค่ค่าในเนื้อ response
   * เดิมคำนวณสถานะถูกแล้วแต่คืน 200 เสมอ ตัวจัดการทราฟฟิกจึงยังส่งคำขอ
   * เข้ามาที่ instance ที่ต่อฐานข้อมูลไม่ได้ ผู้ใช้เจอ error แทนที่จะถูกพาไป instance อื่น
   *
   * degraded ยังตอบ 200 เพราะระบบยังทำงานได้ เช่น Redis ล่มแต่ฐานข้อมูลปกติ
   * มีแต่ down (ฐานข้อมูลหรือที่เก็บไฟล์ใช้ไม่ได้) ที่ต้องถูกถอดออกจากทราฟฟิก
   */
  @Get("readiness")
  async getReadiness() {
    const readiness = await this.monitoringService.getReadiness();

    if (readiness.status === "down") {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }

  @Get("metrics")
  @Auth("ORG_MANAGE")
  getMetrics() {
    return this.monitoringService.getMetrics();
  }

  @Get("overview")
  @Auth("ORG_MANAGE")
  getOverview() {
    return this.monitoringService.getOverview();
  }

  /**
   * รับ token ได้สองทาง — header มาก่อนเสมอ
   *
   * ของเดิมรับทาง `?token=` อย่างเดียว ซึ่งแปลว่าความลับติดไปกับ URL
   * แล้วไปโผล่ใน access log ของ reverse proxy และ log ของแอป
   * Prometheus ตั้ง `authorization` หรือ header เองได้อยู่แล้ว จึงไม่มีเหตุ
   * ต้องส่งทาง query
   *
   * ยังรับทาง query อยู่เพื่อไม่ให้ scrape ที่ตั้งไว้แล้วพังตอนอัปเดต
   * แต่บน production จะถูกปฏิเสธ เพื่อไม่ให้ค้างอยู่แบบนั้นถาวร
   *
   * ตัวอย่างฝั่ง Prometheus:
   *   authorization: { type: Bearer, credentials: <MONITORING_METRICS_TOKEN> }
   */
  @Get("prometheus")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getPrometheusMetrics(
    @Req() request: Request,
    @Query("token") token?: string,
  ) {
    const requiredToken = this.configService.get<string>(
      "MONITORING_METRICS_TOKEN",
      "",
    );

    const isProduction =
      this.configService.get<string>("NODE_ENV", "development") ===
      "production";

    if (!requiredToken && isProduction) {
      throw new UnauthorizedException(
        "Production ต้องกำหนด MONITORING_METRICS_TOKEN ก่อนเปิด Prometheus endpoint",
      );
    }

    if (requiredToken) {
      if (isProduction && token) {
        throw new UnauthorizedException(
          "ไม่อนุญาตให้ส่ง monitoring token ผ่าน query string ใน production — ใช้ header x-metrics-token หรือ Authorization: Bearer แทน",
        );
      }

      const provided = this.readMetricsToken(request) ?? token;

      if (!provided || !this.safeEquals(provided, requiredToken)) {
        throw new UnauthorizedException("Monitoring token ไม่ถูกต้อง");
      }
    }

    return this.monitoringService.getPrometheusMetrics();
  }

  private readMetricsToken(request: Request) {
    const headerToken = request.headers["x-metrics-token"];

    if (typeof headerToken === "string" && headerToken.trim()) {
      return headerToken.trim();
    }

    const authorization = request.headers.authorization;

    if (typeof authorization === "string") {
      const [type, value] = authorization.split(" ");

      if (type === "Bearer" && value) {
        return value.trim();
      }
    }

    return null;
  }

  /** เทียบแบบไม่ให้เดาความยาวจากเวลาที่ใช้ */
  private safeEquals(a: string, b: string) {
    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return diff === 0;
  }
}