import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { MobileAttendanceService } from '../application/mobile-attendance.service';
import { MobileAuth } from '../decorators/mobile-auth.decorator';
import {
  IdempotencyKey,
  MobileClient,
} from '../decorators/mobile-client.decorator';
import {
  MobileAttendanceHistoryQueryDto,
  MobilePunchContextQueryDto,
  MobilePunchDto,
} from '../dto/mobile-attendance.dto';
import { MOBILE_API_PREFIX } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';

@Controller(`${MOBILE_API_PREFIX}/attendance`)
export class MobileAttendanceController {
  constructor(private readonly attendanceService: MobileAttendanceService) {}

  @Get('history')
  @Auth('ESS_ACCESS')
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobileAttendanceHistoryQueryDto,
  ) {
    return this.attendanceService.getHistory(user.id, query);
  }

  /*
   * อ่านอย่างเดียวและผูก userId ของตัวเองทั้งหมด (รอบปัจจุบัน นโยบายพื้นที่
   * จุดสาขา) จึงใช้ด่านเดียวกับ /history คือ ESS_ACCESS — พนักงานที่ HR ยังไม่
   * เปิดให้กดลงเวลาผ่านแอปต้องเห็นแผงลงเวลาแบบกดไม่ได้ ไม่ใช่เจอ 403 คาจอ
   * ด่านจริงของการ "กด" อยู่ที่ POST /punch ข้างล่างซึ่งยังบังคับ ATTENDANCE_CHECKIN
   */
  @Get('punch-context')
  @Auth('ESS_ACCESS')
  async getPunchContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MobilePunchContextQueryDto,
  ) {
    return this.attendanceService.getPunchContext(user.id, query);
  }

  @Post('punch')
  @MobileAuth('ESS_ACCESS', 'ATTENDANCE_CHECKIN')
  async punch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MobilePunchDto,
    @MobileClient() client: MobileClientContext,
    @IdempotencyKey() idempotencyKey: string | null,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'ต้องส่ง Idempotency-Key มาด้วยทุกครั้งที่ลงเวลา',
      );
    }

    return this.attendanceService.punch({
      client,
      dto,
      idempotencyKey,
      userId: user.id,
    });
  }
}
