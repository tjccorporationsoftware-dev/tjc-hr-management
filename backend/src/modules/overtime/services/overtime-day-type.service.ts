import { Injectable } from '@nestjs/common';

import {
  SystemSettingsService,
  type AttendanceEmployeeHolidayScope,
} from '../../settings/system-settings.service';
import {
  resolveOvertimeWorkTypeFromHolidayInfo,
  type ResolvedOvertimeDayType,
} from '../utils/overtime-work-type.util';

/*
 * OvertimeDayTypeService
 * ---------------------------------------------------------
 * จุดเดียวที่ตัดสินว่าใบ OT ของวันนั้นเป็นวันทำงาน/วันหยุด/วันหยุดพิเศษ
 * อ่านจากปฏิทินวันหยุดของหน้า /settings/work-policies (วันหยุดประจำสัปดาห์
 * วันหยุดบริษัท การสลับวันหยุด และประกาศให้มาทำงานในวันหยุด) ตามขอบเขต
 * ของพนักงานคนนั้น ทั้งฝั่ง ESS แอปมือถือ และฝั่ง HR ใช้ตัวนี้ร่วมกัน
 */
@Injectable()
export class OvertimeDayTypeService {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  async resolve(
    workDate: Date,
    employee: AttendanceEmployeeHolidayScope,
  ): Promise<ResolvedOvertimeDayType> {
    const info = await this.systemSettings.getEmployeeAttendanceHolidayInfo(
      workDate,
      employee,
    );

    return resolveOvertimeWorkTypeFromHolidayInfo(info);
  }
}
