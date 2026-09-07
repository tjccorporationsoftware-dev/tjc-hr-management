import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ใช้เป็น liveness probe ของคอนเทนเนอร์
   *
   * ต้องมีเพดานเวลา — ถ้า connection ค้าง (ไม่ใช่ถูกปฏิเสธ) การยิง SELECT 1 ตรง ๆ
   * จะรอตลอดไป ตัว health check เองก็เลยค้างไปด้วย ไม่มีใครตอบได้ว่าระบบตายแล้ว
   * นี่คือสาเหตุที่เซิร์ฟเวอร์ค้างถาวรจนต้อง kill ทิ้งเอง
   */
  @Get()
  async check() {
    /*
     * เช็คสถานะปิดระบบก่อนยิงฐานข้อมูล
     *
     * ถ้า shutdown hook ทำงานไปแล้ว Prisma ถูกตัดการเชื่อมต่อและจะไม่ต่อกลับมา
     * การยิง probe ตอนนี้ได้แต่ backtrace ของ Prisma ที่อ่านไม่รู้เรื่อง
     * ("Engine is not yet connected. Backtrace [{ fn: napi_register_module_v1 }...]")
     * ซึ่งทำให้เข้าใจผิดว่าฐานข้อมูลล่ม ทั้งที่ฐานข้อมูลปกติดีและปัญหาอยู่ที่โปรเซสนี้
     */
    if (this.prisma.isShuttingDown()) {
      throw new ServiceUnavailableException({
        status: "shutting_down",
        service: "hr-workforce-api",
        database: "disconnected",
        error:
          "ระบบปิดการเชื่อมต่อฐานข้อมูลไปแล้วแต่โปรเซสยังทำงานอยู่ — ต้องรีสตาร์ตเซิร์ฟเวอร์",
        timestamp: new Date().toISOString(),
      });
    }

    const result = await this.prisma.probe();

    if (!result.ok) {
      throw new ServiceUnavailableException({
        status: "down",
        service: "hr-workforce-api",
        database: "unreachable",
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ok",
      service: "hr-workforce-api",
      database: "connected",
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * readiness probe — ตอบว่าพร้อมรับทราฟฟิกไหม
   *
   * แยกจาก liveness เพราะสองอย่างนี้ตอบคนละคำถาม
   *   liveness  โปรเซสยังมีชีวิตไหม (ถ้าไม่ ให้รีสตาร์ต)
   *   readiness รับงานได้ไหมตอนนี้ (ถ้าไม่ ให้ถอดออกจาก load balancer ก่อน)
   *
   * ใช้ผลตรวจล่าสุดของ watchdog ไม่ยิงฐานข้อมูลซ้ำ จะได้เรียกถี่ ๆ ได้โดยไม่กินโหลด
   */
  @Get("readiness")
  readiness() {
    const state = this.prisma.getConnectionState();

    if (state.shuttingDown || !state.healthy) {
      throw new ServiceUnavailableException({
        status: state.shuttingDown ? "shutting_down" : "not_ready",
        service: "hr-workforce-api",
        ...state,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ready",
      service: "hr-workforce-api",
      ...state,
      timestamp: new Date().toISOString(),
    };
  }
}
