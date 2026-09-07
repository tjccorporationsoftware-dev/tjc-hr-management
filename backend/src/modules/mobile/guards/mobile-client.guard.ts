import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-user.interface';
import { readMobileClientContext } from '../application/mobile-client-context.util';
import { MobileCompatibilityService } from '../application/mobile-compatibility.service';
import { MobileDeviceService } from '../application/mobile-device.service';

/**
 * ด่านตรวจของ endpoint ที่ "เขียนข้อมูล" ฝั่ง Mobile
 *
 * ลำดับตรวจตามบทที่ 16.2 ข้อ 5-6:
 *   1) แอปเวอร์ชันต่ำกว่าขั้นต่ำ -> 403 APP_UPDATE_REQUIRED
 *   2) เครื่องถูกถอนสิทธิ์         -> 403 DEVICE_REVOKED
 *
 * ไม่ใช้กับ endpoint อ่านอย่าง bootstrap เพราะแอปเก่าต้องอ่าน compatibility
 * มาแสดงหน้าบังคับอัปเดตให้ได้ก่อน
 */
@Injectable()
export class MobileClientGuard implements CanActivate {
  constructor(
    private readonly compatibilityService: MobileCompatibilityService,
    private readonly deviceService: MobileDeviceService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const client = readMobileClientContext(request);

    this.compatibilityService.assertSupported(client);

    if (request.user) {
      await this.deviceService.assertDeviceIsActive(
        request.user.id,
        client.installationId,
      );
    }

    return true;
  }
}
