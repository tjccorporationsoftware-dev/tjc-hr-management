import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { OvertimeWorkTypeValue } from '../types/overtime.types';
import { OVERTIME_WORK_TYPE_LABEL } from '../utils/overtime-work-type.util';

/*
 * OvertimePolicyResolverService
 * ---------------------------------------------------------
 * เลือกนโยบายตามลำดับความเฉพาะเจาะจง:
 * 1) สาขา + ประเภทพนักงาน
 * 2) สาขา + ทุกประเภทพนักงาน
 * 3) ทุกสาขา + ประเภทพนักงาน
 * 4) ทุกสาขา + ทุกประเภทพนักงาน
 */
@Injectable()
export class OvertimePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateAndValidateTotalHours(params: {
    companyId: string;
    branchId: string | null;
    employeeTypeId: string | null;
    workType: OvertimeWorkTypeValue;
    startTime: Date;
    endTime: Date;
    breakMinutes: number;
  }) {
    if (params.endTime <= params.startTime) {
      throw new BadRequestException('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
    }

    if (params.breakMinutes < 0) {
      throw new BadRequestException('เวลาพักต้องไม่น้อยกว่า 0 นาที');
    }

    const diffMinutes =
      (params.endTime.getTime() - params.startTime.getTime()) / 1000 / 60;
    const totalMinutes = diffMinutes - params.breakMinutes;

    if (totalMinutes <= 0) {
      throw new BadRequestException('จำนวนชั่วโมง OT ต้องมากกว่า 0');
    }

    const policy = await this.findApplicablePolicy(params);

    if (totalMinutes < policy.minMinutes) {
      throw new BadRequestException(
        `จำนวน OT ต้องไม่น้อยกว่า ${policy.minMinutes.toLocaleString('th-TH')} นาที`,
      );
    }

    // "เวลาคำนวณ" — เริ่มคำนวณทันที หรือเริ่มนับหลังผ่านขั้นต่ำไปแล้ว
    const payableMinutes =
      policy.calcStartMode === 'AFTER_MIN_MINUTES'
        ? totalMinutes - policy.minMinutes
        : totalMinutes;

    if (payableMinutes <= 0) {
      throw new BadRequestException('จำนวนชั่วโมง OT ต้องมากกว่า 0');
    }

    const totalHours = this.applyHourRounding(
      Math.round((payableMinutes / 60) * 100) / 100,
      policy.hourRoundingMode,
    );

    if (totalHours <= 0) {
      throw new BadRequestException(
        'จำนวนชั่วโมง OT หลังปัดเศษตามนโยบายเป็น 0 — เพิ่มเวลา OT หรือปรับการปัดเศษ',
      );
    }

    if (
      policy.maxHoursPerDay !== null &&
      policy.maxHoursPerDay !== undefined &&
      totalHours > Number(policy.maxHoursPerDay)
    ) {
      throw new BadRequestException(
        `จำนวน OT เกินกว่าที่นโยบายกำหนด สูงสุด ${Number(
          policy.maxHoursPerDay,
        ).toLocaleString('th-TH')} ชั่วโมงต่อวัน`,
      );
    }

    return totalHours;
  }

  /** "การปัดเศษชั่วโมง" ก่อนนำชั่วโมงไปคูณอัตรา */
  private applyHourRounding(
    hours: number,
    mode: 'NONE' | 'HALF_HOUR_DOWN' | 'HALF_HOUR_UP' | 'HOUR_DOWN' | 'HOUR_UP',
  ) {
    switch (mode) {
      case 'HALF_HOUR_DOWN':
        return Math.floor(hours * 2) / 2;
      case 'HALF_HOUR_UP':
        return Math.ceil(hours * 2) / 2;
      case 'HOUR_DOWN':
        return Math.floor(hours);
      case 'HOUR_UP':
        return Math.ceil(hours);
      default:
        return hours;
    }
  }

  private async findApplicablePolicy(params: {
    companyId: string;
    branchId: string | null;
    employeeTypeId: string | null;
    workType: OvertimeWorkTypeValue;
  }) {
    const policies = await this.prisma.overtimePolicy.findMany({
      where: {
        companyId: params.companyId,
        workType: params.workType,
        deletedAt: null,
        status: 'ACTIVE',
        AND: [
          {
            OR: params.branchId
              ? [{ branchId: params.branchId }, { branchId: null }]
              : [{ branchId: null }],
          },
          {
            OR: params.employeeTypeId
              ? [
                  { employeeTypeId: params.employeeTypeId },
                  { employeeTypeId: null },
                ]
              : [{ employeeTypeId: null }],
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const ranked = policies
      .map((policy) => ({
        policy,
        score:
          (params.branchId && policy.branchId === params.branchId ? 2 : 0) +
          (params.employeeTypeId &&
          policy.employeeTypeId === params.employeeTypeId
            ? 1
            : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const selected = ranked[0]?.policy;

    if (!selected) {
      /*
       * ประเภทวันถูกระบบจับให้จากปฏิทินแล้ว ผู้ยื่นเปลี่ยนเองไม่ได้
       * ข้อความจึงต้องบอกด้วยว่าขาดนโยบายของวันประเภทไหน ไม่งั้น HR ไล่ไม่ถูก
       */
      throw new BadRequestException(
        `ยังไม่พบนโยบาย OT ประเภท "${OVERTIME_WORK_TYPE_LABEL[params.workType]}" สำหรับพนักงานคนนี้`,
      );
    }

    return selected;
  }
}
