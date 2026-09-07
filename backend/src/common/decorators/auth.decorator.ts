import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { MustChangePasswordGuard } from '../guards/must-change-password.guard';
import { RequirePermissions } from './require-permissions.decorator';

/**
 * Auth decorator
 * --------------
 * ใช้สำหรับ endpoint ที่ต้อง login
 *
 * วิธีใช้:
 * 1) @Auth()
 *    = ต้อง login อย่างเดียว
 *
 * 2) @Auth('EMPLOYEE_READ')
 *    = ต้อง login และต้องมี permission EMPLOYEE_READ
 *
 * 3) @Auth() + @RequirePermissions('EMPLOYEE_READ')
 *    = ต้อง login และให้ PermissionGuard อ่าน permission จาก metadata
 *
 * จุดสำคัญ:
 * - ต้องใส่ PermissionGuard เสมอ
 * - ถ้า endpoint ไม่มี @RequirePermissions และไม่ได้ส่ง permission เข้า @Auth()
 *   PermissionGuard จะ return true ให้ผ่านตามปกติ
 */
export function Auth(...permissions: string[]) {
  /*
   * MustChangePasswordGuard วางไว้กลาง — หลังยืนยันตัวตน (มี req.user แล้ว)
   * แต่ก่อนตรวจสิทธิ์ เพื่อให้บัญชีที่ยังไม่เปลี่ยนรหัสถูกกันตั้งแต่ต้น
   * endpoint ที่ต้องใช้ได้ระหว่างนั้น ให้ใส่ @AllowWhenPasswordExpired()
   */
  if (permissions.length === 0) {
    return applyDecorators(
      UseGuards(JwtAuthGuard, MustChangePasswordGuard, PermissionGuard),
    );
  }

  return applyDecorators(
    RequirePermissions(...permissions),
    UseGuards(JwtAuthGuard, MustChangePasswordGuard, PermissionGuard),
  );
}