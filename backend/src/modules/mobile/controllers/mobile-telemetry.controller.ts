import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileTelemetryService } from '../application/mobile-telemetry.service';
import { MobileClient } from '../decorators/mobile-client.decorator';
import { MobileTelemetryDto } from '../dto/mobile-telemetry.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

/**
 * MOB-005 — ปลายทาง crash/error ของแอป
 *
 * ใช้ @Auth เปล่า (ไม่ระบุ permission) โดยตั้งใจ:
 * บัญชีที่ยังไม่ผูกพนักงานหรือไม่มีสิทธิ์ ESS คือกลุ่มที่ "แอปพังให้เห็น" พอดี
 * ถ้าบังคับ ESS_ACCESS เราจะมองไม่เห็น error ของกลุ่มที่มีปัญหามากที่สุด
 *
 * ไม่ใส่ MobileClientGuard ด้วยเหตุผลเดียวกับ bootstrap — แอปเวอร์ชันต่ำกว่า
 * ขั้นต่ำต้องยังรายงานปัญหากลับมาได้
 */
@Controller(`${MOBILE_API_PREFIX}/telemetry`)
export class MobileTelemetryController {
  constructor(private readonly telemetryService: MobileTelemetryService) {}

  @Post()
  @Auth()
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({
    keyPrefix: 'mobile:telemetry',
    limit: 60,
    windowSeconds: 60,
    includeUserId: true,
    message: 'ส่งรายงานปัญหาถี่เกินไป กรุณารอสักครู่',
  })
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobileTelemetryDto,
    @MobileClient() client: MobileClientContext,
  ) {
    return this.telemetryService.record(user.id, dto.events, client);
  }
}
