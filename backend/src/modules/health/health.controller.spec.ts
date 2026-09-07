import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import type { PrismaService } from "../../database/prisma.service";

/**
 * เทสสถานะ "โปรเซสยังอยู่แต่ฐานข้อมูลถูกตัดไปแล้ว"
 *
 * เคสนี้เคยทำให้ทีมไล่หาสาเหตุผิดทาง เพราะ /health โยน backtrace ของ Prisma
 * ออกมาว่า "Engine is not yet connected" ซึ่งอ่านแล้วเหมือนฐานข้อมูลล่ม
 * ทั้งที่ฐานข้อมูลปกติดี ปัญหาอยู่ที่โปรเซสนี้ปิดการเชื่อมต่อไปแล้วแต่ไม่ยอมตาย
 */
function makePrisma(overrides: Partial<PrismaService> = {}) {
  return {
    isShuttingDown: () => false,
    probe: async () => ({ ok: true as const, latencyMs: 3 }),
    getConnectionState: () => ({
      healthy: true,
      shuttingDown: false,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastError: null,
    }),
    ...overrides,
  } as unknown as PrismaService;
}

describe("HealthController", () => {
  describe("liveness /health", () => {
    it("ฐานข้อมูลปกติ ตอบ ok", async () => {
      const controller = new HealthController(makePrisma());
      const result = await controller.check();

      expect(result.status).toBe("ok");
      expect(result.database).toBe("connected");
    });

    it("ฐานข้อมูลต่อไม่ได้ ตอบ 503 พร้อมสาเหตุ", async () => {
      const controller = new HealthController(
        makePrisma({
          probe: async () => ({
            ok: false as const,
            latencyMs: 3000,
            error: "ฐานข้อมูลไม่ตอบภายใน 3000 มิลลิวินาที",
          }),
        } as Partial<PrismaService>),
      );

      await expect(controller.check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    /*
     * จุดสำคัญ: ต้องไม่ยิง probe เลยเมื่อรู้อยู่แล้วว่าปิดการเชื่อมต่อไปแล้ว
     * เพราะผลที่ได้คือ backtrace ที่ทำให้เข้าใจผิดว่าฐานข้อมูลล่ม
     */
    it("shutdown hook ทำงานไปแล้ว ต้องบอกว่าให้รีสตาร์ต ไม่ใช่โทษฐานข้อมูล", async () => {
      let probeCalled = false;

      const controller = new HealthController(
        makePrisma({
          isShuttingDown: () => true,
          probe: async () => {
            probeCalled = true;
            return { ok: true as const, latencyMs: 1 };
          },
        } as Partial<PrismaService>),
      );

      await expect(controller.check()).rejects.toMatchObject({
        response: {
          status: "shutting_down",
          database: "disconnected",
        },
      });

      expect(probeCalled).toBe(false);
    });
  });

  describe("readiness /health/readiness", () => {
    it("พร้อมรับทราฟฟิก ตอบ ready", () => {
      const controller = new HealthController(makePrisma());

      expect(controller.readiness().status).toBe("ready");
    });

    it("watchdog เห็นว่าฐานข้อมูลใช้ไม่ได้ ตอบ 503", () => {
      const controller = new HealthController(
        makePrisma({
          getConnectionState: () => ({
            healthy: false,
            shuttingDown: false,
            lastCheckedAt: new Date().toISOString(),
            consecutiveFailures: 3,
            lastError: "connection refused",
          }),
        } as Partial<PrismaService>),
      );

      expect(() => controller.readiness()).toThrow(ServiceUnavailableException);
    });

    it("กำลังปิดระบบ ต้องถูกถอดออกจากทราฟฟิกทันที", () => {
      const controller = new HealthController(
        makePrisma({
          getConnectionState: () => ({
            healthy: true,
            shuttingDown: true,
            lastCheckedAt: new Date().toISOString(),
            consecutiveFailures: 0,
            lastError: null,
          }),
        } as Partial<PrismaService>),
      );

      expect(() => controller.readiness()).toThrow(ServiceUnavailableException);
    });
  });
});
