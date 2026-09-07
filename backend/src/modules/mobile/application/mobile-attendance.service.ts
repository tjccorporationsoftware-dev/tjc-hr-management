import { BadRequestException, Injectable } from '@nestjs/common';

import {
  buildPayrollPeriodRange,
  findPayrollPeriodContaining,
  toPayrollDateKey,
} from '../../../common/utils/payroll-period-range.util';
import { PrismaService } from '../../../database/prisma.service';
import { AttendanceService } from '../../attendance/attendance.service';
import { CompanyPayrollSettingsService } from '../../settings/company-payroll-settings.service';
import type {
  MobileAttendanceHistoryQueryDto,
  MobilePunchContextQueryDto,
  MobilePunchDto,
} from '../dto/mobile-attendance.dto';
import {
  toMobileAttendanceHistory,
  toMobilePunchContext,
  toMobilePunchResult,
} from '../mappers/mobile-attendance.mapper';
import { MOBILE_IDEMPOTENCY_SCOPES } from '../mobile.constants';
import type { MobileClientContext } from '../types/mobile-context.types';
import { MobileIdempotencyService } from './mobile-idempotency.service';

/**
 * Attendance สำหรับ Mobile
 *
 * ประเภท endpoint: PASSTHROUGH + ซอง Idempotency (BE-MOB-005)
 * AttendanceService ยังเป็นเจ้าของนโยบายทั้งหมด: กะ, geofence, กันซ้ำ, คิวคำนวณ
 */
/** ช่วงเดือนปฏิทิน — วันสุดท้ายคือวันที่ 0 ของเดือนถัดไป */
function resolveCalendarPeriod(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    from: `${month}-01`,
    to: `${month}-${pad(lastDay)}`,
    type: 'calendar' as const,
  };
}

@Injectable()
export class MobileAttendanceService {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly idempotencyService: MobileIdempotencyService,
    private readonly payrollSettingsService: CompanyPayrollSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async getPunchContext(userId: string, query: MobilePunchContextQueryDto) {
    const context = await this.attendanceService.getPunchContext(userId, {
      punchType: query.punchType,
      punchedAt: query.punchedAt,
    });

    return toMobilePunchContext(context as never);
  }

  /**
   * ประวัติเวลาของตัวเอง ทีละเดือน
   *
   * เรียก findMyDailySummaries ซึ่งผูก employeeId จาก userId ให้เองอยู่แล้ว
   * ตรงนี้จึงไม่มีทางหลุดไปดูของคนอื่นแม้จะส่ง employeeId มาใน query
   */
  async getHistory(userId: string, query: MobileAttendanceHistoryQueryDto) {
    const period =
      query.range === 'payroll'
        ? await this.resolvePayrollPeriod(userId, query.month, query.anchorDate)
        : resolveCalendarPeriod(query.month);

    const result = await this.attendanceService.findMyDailySummaries(userId, {
      dateFrom: period.from,
      dateTo: period.to,
      page: 1,
      /* ทั้งเดือนปฏิทินและงวดเงินเดือนยาวไม่เกิน 31 วัน จึงได้ครบในหน้าเดียว */
      pageSize: 100,
    });

    return toMobileAttendanceHistory(
      (result.items ?? []) as never,
      query.month,
      period,
    );
  }

  /**
   * ช่วงของงวดเงินเดือนตามที่บริษัทตั้งไว้
   *
   * อ่านค่าจาก CompanyPayrollSetting ของบริษัทที่พนักงานสังกัด แล้วคำนวณด้วย
   * ตัวเดียวกับที่โมดูลเงินเดือนใช้สร้างงวดจริง — ถ้าคำนวณเองซ้ำอีกชุด
   * วันหนึ่งสองฝั่งจะเพี้ยนกันแล้วไม่มีใครรู้จนกว่าผู้ใช้จะทักว่าเลขไม่ตรงสลิป
   *
   * หาบริษัทไม่เจอ (บัญชียังไม่ผูกพนักงาน) ให้ตกกลับไปใช้เดือนปฏิทิน
   * ดีกว่าโยน error ทิ้งทั้งจอเพราะเรื่องการตั้งค่าที่ผู้ใช้แก้เองไม่ได้
   */
  private async resolvePayrollPeriod(
    userId: string,
    month: string,
    anchorDate?: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      select: { companyId: true },
      where: { deletedAt: null, userId },
    });

    if (!employee?.companyId) {
      return resolveCalendarPeriod(month);
    }

    const settings =
      await this.payrollSettingsService.resolvePayrollCalculationSettings(
        employee.companyId,
      );

    const [year, monthNumber] = month.split('-').map(Number);
    const range = anchorDate
      ? findPayrollPeriodContaining(anchorDate, settings)
      : buildPayrollPeriodRange(year!, monthNumber!, settings);

    return {
      from: toPayrollDateKey(range.startDate),
      to: toPayrollDateKey(range.endDate),
      type: 'payroll' as const,
    };
  }

  async punch(params: {
    client: MobileClientContext;
    dto: MobilePunchDto;
    idempotencyKey: string;
    userId: string;
  }) {
    const { client, dto, idempotencyKey, userId } = params;

    const begin = await this.idempotencyService.begin({
      key: idempotencyKey,
      requestPayload: dto,
      scope: MOBILE_IDEMPOTENCY_SCOPES.attendancePunch,
      userId,
    });

    if (begin.status === 'REPLAY') {
      return begin.responseBody;
    }

    try {
      const log = await this.attendanceService.punch(
        {
          punchType: dto.punchType,
          source: 'MOBILE_APP',
          // ตั้งใจไม่ส่ง punchedAt: เวลาที่บันทึกต้องมาจาก server เท่านั้น
          // นาฬิกาเครื่องที่เพี้ยน/ถูกปรับ จึงเปลี่ยนเวลาลงบันทึกไม่ได้
          latitude: dto.location?.latitude,
          longitude: dto.location?.longitude,
          gpsAccuracy: dto.location?.accuracyMeters,
          offsiteRequestId: dto.offsiteRequestId,
          note: dto.note,
        },
        userId,
        {
          ipAddress: client.ipAddress ?? undefined,
          userAgent: client.userAgent ?? undefined,
        },
      );

      const response = {
        ...toMobilePunchResult(log as never),
        clockDriftSeconds: this.getClockDriftSeconds(dto.client.capturedAt),
      };

      await this.idempotencyService.complete(begin.recordId, 201, response);

      return response;
    } catch (error) {
      // ปล่อย key คืนเมื่อไม่มีรายการถูกบันทึก ผู้ใช้จะได้กดใหม่ได้ทันที
      await this.idempotencyService.release(begin.recordId);
      throw error;
    }
  }

  /**
   * ส่วนต่างเวลาเครื่องกับเวลา server — ใช้เป็นสัญญาณให้ QA/แอปเตือนผู้ใช้
   * ไม่เก็บลงฐานข้อมูล เพราะ field audit ของ offline punch จะเพิ่มตอนเปิด Phase 6 (บทที่ 13.8)
   */
  private getClockDriftSeconds(capturedAt: string) {
    const captured = new Date(capturedAt);

    if (Number.isNaN(captured.getTime())) {
      throw new BadRequestException('เวลาที่เครื่องส่งมาไม่ถูกต้อง');
    }

    return Math.round((Date.now() - captured.getTime()) / 1000);
  }
}
