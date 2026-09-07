import { applyDecorators, UseGuards } from '@nestjs/common';

import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { MobileClientGuard } from '../guards/mobile-client.guard';

/**
 * ใช้กับ endpoint ที่เขียนข้อมูลจากแอป
 *
 * ประกาศ guard ทั้งชุดใน UseGuards ตัวเดียว เพื่อการันตีลำดับ
 * JwtAuthGuard -> PermissionGuard -> MobileClientGuard
 * (MobileClientGuard ต้องรันหลังสุด เพราะต้องใช้ request.user)
 */
export function MobileAuth(...permissions: string[]) {
  if (permissions.length === 0) {
    return applyDecorators(
      UseGuards(JwtAuthGuard, PermissionGuard, MobileClientGuard),
    );
  }

  return applyDecorators(
    RequirePermissions(...permissions),
    UseGuards(JwtAuthGuard, PermissionGuard, MobileClientGuard),
  );
}
