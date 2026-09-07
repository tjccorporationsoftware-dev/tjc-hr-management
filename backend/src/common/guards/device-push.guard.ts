import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

/**
 * ยืนยันตัวตนของเครื่องสแกนลายนิ้วมือที่ยิงเข้ามาที่ /iclock/*
 *
 * ทำไมต้องมีตัวนี้แยกจาก JwtAuthGuard:
 * เครื่องสแกน (โปรโตคอล ADMS/iclock ของ ZKTeco) ล็อกอินไม่ได้ ตั้งค่าได้แค่ URL
 * ปลายทางเท่านั้น จึงใช้ JWT ไม่ได้ ของเดิมยืนยันด้วย Serial Number อย่างเดียว
 * ซึ่งไม่ใช่ความลับ — เลขนี้พิมพ์ติดอยู่บนตัวเครื่อง ใครเห็นก็ยิงข้อมูลลงเวลา
 * ปลอมเข้าระบบได้ (endpoint เหล่านี้เขียน AttendanceLog จริง)
 *
 * ตัวนี้จึงบังคับสองชั้น:
 *  1. shared secret ใน query `?token=` หรือ header `x-device-token`
 *  2. IP allowlist (ถ้าตั้งค่าไว้)
 *
 * บน production ถ้าไม่ตั้ง ATTENDANCE_DEVICE_PUSH_TOKEN จะปฏิเสธทุกคำขอ
 * (fail closed) เพื่อไม่ให้เผลอเปิดช่องไว้เพราะลืมตั้งค่า
 */
@Injectable()
export class DevicePushGuard implements CanActivate {
  private readonly logger = new Logger(DevicePushGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const expectedToken = this.configService.get<string>(
      "ATTENDANCE_DEVICE_PUSH_TOKEN",
    );
    const isProduction =
      this.configService.get<string>("NODE_ENV") === "production";

    if (!expectedToken) {
      if (isProduction) {
        this.logger.error(
          "ปฏิเสธคำขอจากเครื่องสแกน: ยังไม่ได้ตั้ง ATTENDANCE_DEVICE_PUSH_TOKEN บน production",
        );
        throw new UnauthorizedException("device push is not configured");
      }

      // dev: ยอมให้ผ่านเพื่อทดสอบกับเครื่องจริงได้ แต่เตือนไว้ให้เห็น
      this.logger.warn(
        "ATTENDANCE_DEVICE_PUSH_TOKEN ยังไม่ได้ตั้ง — /iclock/* เปิดรับข้อมูลโดยไม่ตรวจ token (dev เท่านั้น)",
      );
      return this.checkIpAllowlist(request);
    }

    const provided =
      (request.query?.token as string | undefined) ??
      (request.headers["x-device-token"] as string | undefined);

    if (!provided || !this.safeEquals(provided, expectedToken)) {
      this.logger.warn(
        `ปฏิเสธคำขอจากเครื่องสแกน: token ไม่ถูกต้อง (SN=${
          (request.query?.SN as string | undefined) ?? "-"
        })`,
      );
      throw new UnauthorizedException("invalid device token");
    }

    return this.checkIpAllowlist(request);
  }

  /** จำกัด IP ต้นทาง — ข้ามถ้าไม่ได้ตั้งค่าไว้ */
  private checkIpAllowlist(request: Request): boolean {
    const raw = this.configService.get<string>(
      "ATTENDANCE_DEVICE_PUSH_ALLOWED_IPS",
    );

    if (!raw?.trim()) {
      return true;
    }

    const allowed = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    // ใช้ request.ip ที่ผ่าน trust proxy ของ express แล้ว ไม่อ่าน header เอง
    // เพราะ X-Forwarded-For ปลอมได้ถ้าไม่ได้ตั้ง trust proxy ให้ตรงกับ hop จริง
    const ip = request.ip ?? "";

    if (!allowed.some((entry) => ip === entry || ip.endsWith(entry))) {
      this.logger.warn(`ปฏิเสธคำขอจากเครื่องสแกน: IP ${ip} ไม่อยู่ใน allowlist`);
      throw new UnauthorizedException("device ip not allowed");
    }

    return true;
  }

  /** เทียบแบบไม่ให้เดาความยาวจากเวลาที่ใช้ */
  private safeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return diff === 0;
  }
}
