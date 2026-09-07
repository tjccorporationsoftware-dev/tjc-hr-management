import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

function createPrismaAdapter() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined in .env");
  }

  return new PrismaPg({
    connectionString: databaseUrl,
  });
}

/** ระยะห่างระหว่างการตรวจสุขภาพฐานข้อมูล */
const WATCHDOG_INTERVAL_MS = 15_000;

/**
 * เพดานเวลาของคำสั่งตรวจ
 *
 * สำคัญกว่าที่คิด: ถ้า connection "ค้าง" (ไม่ใช่ถูกปฏิเสธ) คำสั่งจะรอตลอดไป
 * นี่คือสาเหตุที่เซิร์ฟเวอร์ค้างถาวรเมื่อฐานข้อมูลหลุด — ตัว health check เองก็ค้างด้วย
 * จึงไม่มีใครตอบได้ว่าระบบตายแล้ว และ orchestrator ก็ไม่รู้ว่าต้องรีสตาร์ต
 */
const PROBE_TIMEOUT_MS = 3_000;

/** ตรวจไม่ผ่านติดกันกี่ครั้งถึงจะพยายามต่อใหม่ */
const FAILURES_BEFORE_RECONNECT = 2;

/**
 * เวลารอให้โปรเซสปิดตัวเองหลัง shutdown hook ทำงานเสร็จ
 *
 * ปกติ Nest ปิด HTTP server แล้วโปรเซสจะจบเอง แต่ถ้ามีอะไรค้าง event loop ไว้
 * (เช่นตัวรีสตาร์ตของ --watch ที่ล้มกลางคัน) จะได้โปรเซสที่ยังยึดพอร์ตอยู่
 * แต่ Prisma ถูก $disconnect ไปแล้วและ watchdog ถูกหยุด — ทุก request หลังจากนั้น
 * พังด้วย "Engine is not yet connected" ตลอดไปโดยไม่มีอะไรฟื้นและไม่มีสัญญาณเตือน
 *
 * ตั้งไว้ยาวโดยตั้งใจ: การปิดปกติต้องรอ request ที่ยังค้างอยู่ให้จบก่อน ซึ่งงานหนัก
 * อย่างสร้าง PDF หรือคำนวณเงินเดือนกินเวลาหลายวินาที ถ้าตั้งสั้นไปจะไปตัดงานที่กำลัง
 * ปิดตัวอย่างถูกต้องทิ้ง ส่วนกรณีที่ค้างจริงจะค้างตลอดไปอยู่แล้ว รออีก 20 วินาทีไม่เสียหาย
 */
const SHUTDOWN_GRACE_MS = 30_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  private watchdogTimer: NodeJS.Timeout | null = null;
  private forcedExitTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private reconnecting = false;
  private shuttingDown = false;

  /** ผลตรวจล่าสุด — ให้ /readiness อ่านได้โดยไม่ต้องยิงฐานข้อมูลซ้ำ */
  private lastProbeOk = true;
  private lastProbeAt: Date | null = null;
  private lastProbeError: string | null = null;

  constructor() {
    super({
      adapter: createPrismaAdapter(),
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.startWatchdog();
  }

  async onModuleDestroy() {
    this.stopWatchdog();
    await this.$disconnect();
  }

  onApplicationShutdown() {
    // กันไม่ให้ watchdog พยายามต่อใหม่ระหว่างที่กำลังปิดระบบ
    this.shuttingDown = true;
    this.stopWatchdog();
    this.armForcedExit();
  }

  /**
   * shutdown hook ทำงานไปแล้วหรือยัง
   *
   * ถ้าจริง แปลว่า Prisma ถูกตัดการเชื่อมต่อไปแล้วและจะไม่ต่อกลับมาอีก
   * ทุก query หลังจากนี้พังแน่นอน — /health ต้องบอกให้ตรงว่าเป็นเพราะระบบกำลังปิด
   * ไม่ใช่โยน backtrace ของ Prisma ที่อ่านไม่รู้เรื่องออกไป
   */
  isShuttingDown() {
    return this.shuttingDown;
  }

  /**
   * ตาข่ายกันโปรเซสซอมบี้
   *
   * ตั้งเวลาไว้หลัง shutdown hook ทำงาน ถ้าโปรเซสปิดตัวเองได้ตามปกติ ตัวจับเวลานี้
   * จะหายไปพร้อมโปรเซสโดยไม่ได้ทำงาน (unref ไว้จึงไม่ได้ยื้อ event loop เอง)
   * แต่ถ้าเลยเวลาแล้วยังอยู่ แปลว่าค้างจริง — ปิดทิ้งดีกว่าปล่อยให้ยึดพอร์ตไว้
   * แล้วตอบทุก request ด้วย error โดยที่ไม่มีใครรู้ว่าต้องรีสตาร์ต
   */
  private armForcedExit() {
    // ในเทสไม่ต้องตั้ง จะได้ไม่ไปยุ่งกับ process ของ jest
    if (this.forcedExitTimer || process.env.NODE_ENV === "test") return;

    this.forcedExitTimer = setTimeout(() => {
      this.logger.error(
        `ปิดระบบไปแล้วแต่โปรเซสยังไม่จบภายใน ${SHUTDOWN_GRACE_MS} มิลลิวินาที ` +
          "— บังคับปิดเพื่อไม่ให้ค้างเป็นโปรเซสที่ยึดพอร์ตแต่ใช้งานฐานข้อมูลไม่ได้",
      );
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);

    this.forcedExitTimer.unref?.();
  }

  /**
   * ตรวจฐานข้อมูลแบบมีเพดานเวลา
   *
   * ใช้กับ /health และ /readiness แทนการยิง `$queryRaw` ตรง ๆ
   * เพื่อให้ยังตอบได้แม้ connection ค้าง
   */
  async probe(timeoutMs = PROBE_TIMEOUT_MS) {
    const startedAt = Date.now();

    try {
      await this.withTimeout(this.$queryRaw`SELECT 1`, timeoutMs);

      this.lastProbeOk = true;
      this.lastProbeAt = new Date();
      this.lastProbeError = null;

      return { ok: true as const, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.lastProbeOk = false;
      this.lastProbeAt = new Date();
      this.lastProbeError = message;

      return {
        ok: false as const,
        latencyMs: Date.now() - startedAt,
        error: message,
      };
    }
  }

  /** สถานะล่าสุดที่ watchdog เห็น ใช้ประกอบหน้าเฝ้าระวัง */
  getConnectionState() {
    return {
      healthy: this.lastProbeOk,
      shuttingDown: this.shuttingDown,
      lastCheckedAt: this.lastProbeAt?.toISOString() ?? null,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastProbeError,
    };
  }

  private startWatchdog() {
    if (this.watchdogTimer) return;

    this.watchdogTimer = setInterval(() => {
      void this.runWatchdogCycle();
    }, WATCHDOG_INTERVAL_MS);

    // ไม่ให้ตัวจับเวลากันไม่ให้โปรเซสปิดตัวลงตอน shutdown
    this.watchdogTimer.unref?.();
  }

  private stopWatchdog() {
    if (!this.watchdogTimer) return;

    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private async runWatchdogCycle() {
    if (this.shuttingDown || this.reconnecting) return;

    const result = await this.probe();

    if (result.ok) {
      if (this.consecutiveFailures > 0) {
        this.logger.log(
          `ฐานข้อมูลกลับมาใช้งานได้แล้ว (ล้มเหลวติดกัน ${this.consecutiveFailures} ครั้งก่อนหน้า)`,
        );
      }

      this.consecutiveFailures = 0;
      return;
    }

    this.consecutiveFailures += 1;

    this.logger.warn(
      `ตรวจฐานข้อมูลไม่ผ่านครั้งที่ ${this.consecutiveFailures}: ${result.error}`,
    );

    if (this.consecutiveFailures >= FAILURES_BEFORE_RECONNECT) {
      await this.reconnect();
    }
  }

  /**
   * ตัดการเชื่อมต่อเดิมทิ้งแล้วต่อใหม่
   *
   * ของเดิมไม่มีขั้นตอนนี้เลย พอ Prisma หลุดจากฐานข้อมูล (เช่นฐานข้อมูลรีสตาร์ต
   * หรือ connection ถูกตัดกลางทาง) เซิร์ฟเวอร์จะค้างถาวรจนกว่าจะ kill ทิ้งเอง
   */
  private async reconnect() {
    this.reconnecting = true;

    try {
      this.logger.warn("กำลังเชื่อมต่อฐานข้อมูลใหม่");

      // ตัดของเดิมทิ้งก่อน ล้มก็ไม่เป็นไร ตัวเชื่อมนั้นใช้ไม่ได้อยู่แล้ว
      await this.withTimeout(this.$disconnect(), PROBE_TIMEOUT_MS).catch(
        () => undefined,
      );
      await this.withTimeout(this.$connect(), PROBE_TIMEOUT_MS);

      const result = await this.probe();

      if (result.ok) {
        this.logger.log("เชื่อมต่อฐานข้อมูลใหม่สำเร็จ");
        this.consecutiveFailures = 0;
        return;
      }

      /*
       * ต่อใหม่แล้วยังใช้ไม่ได้ ปล่อยให้ /readiness ตอบ 503 ต่อไป
       * เพื่อให้ตัวจัดการทราฟฟิกถอด instance นี้ออก และ orchestrator รีสตาร์ตให้
       * ดีกว่าพยายามซ่อมเองไปเรื่อย ๆ โดยที่ผู้ใช้ยังเจอ error อยู่
       */
      this.logger.error(
        `เชื่อมต่อฐานข้อมูลใหม่แล้วยังใช้ไม่ได้: ${result.error}`,
      );
    } catch (error) {
      this.logger.error(
        `เชื่อมต่อฐานข้อมูลใหม่ไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.reconnecting = false;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`ฐานข้อมูลไม่ตอบภายใน ${timeoutMs} มิลลิวินาที`),
        );
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
