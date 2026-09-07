import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ALLOW_WHEN_PASSWORD_EXPIRED_KEY } from "../decorators/allow-when-password-expired.decorator";
import type { AuthenticatedRequest } from "../interfaces/authenticated-user.interface";

/**
 * บังคับเปลี่ยนรหัสผ่านก่อนใช้งานระบบ
 * ===================================
 * บัญชีที่ผู้ดูแลเป็นคนตั้งรหัสให้ (สร้างใหม่ / รีเซ็ต) จะถูกกันไว้ไม่ให้เรียก API
 * ใด ๆ จนกว่าจะเปลี่ยนรหัสด้วยตัวเอง
 *
 * กันฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่พาไปหน้าเปลี่ยนรหัสที่ฝั่งหน้าเว็บ — ถ้ากันแค่หน้าเว็บ
 * คนที่ยิง API ตรงก็ข้ามได้ และผู้ดูแลก็ยังรู้รหัสของเจ้าตัวอยู่ดี
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHEN_PASSWORD_EXPIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowed) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    // ยังไม่ผ่าน JwtAuthGuard ปล่อยให้ guard นั้นจัดการเอง
    if (!user) return true;

    if (user.mustChangePassword) {
      throw new ForbiddenException(
        "ต้องเปลี่ยนรหัสผ่านก่อนใช้งานระบบ",
      );
    }

    return true;
  }
}
