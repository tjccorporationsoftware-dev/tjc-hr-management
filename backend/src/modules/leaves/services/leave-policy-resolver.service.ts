import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  isStatutoryLeave,
  isUnschedulableLeave,
} from '../utils/statutory-leave.util';
import { toThaiDateOnly } from '../../../common/utils/thai-date.util';

type PolicyWithTiers = Prisma.LeavePolicyGetPayload<{
  include: { quotaTiers: true };
}>;

/**
 * ข้อมูลพนักงานเท่าที่ resolver ต้องใช้
 * หมายเหตุ: เพศเก็บอยู่ที่ EmployeeProfile (relation 1:1) ไม่ใช่ตาราง Employee
 */
export type LeaveEligibilityEmployee = {
  id: string;
  companyId: string;
  branchId: string | null;
  employeeTypeId: string | null;
  startDate: Date;
  probationPassedAt: Date | null;
  profile?: { gender: 'MALE' | 'FEMALE' | 'OTHER' | 'NOT_SPECIFIED' } | null;
};

/** เงื่อนไขระดับประเภทลาที่ต้องใช้ตรวจสิทธิ์ */
export type LeaveEligibilityType = {
  id: string;
  nameTh: string;
  /** ใช้ระบุว่าเป็นสิทธิลาตามกฎหมายที่การตั้งค่าเอาชนะไม่ได้ */
  code?: string | null;
  referenceCode?: string | null;
  advanceNoticeDays: number;
  genderEligibility: 'ALL' | 'MALE' | 'FEMALE';
  serviceStartBasis: 'HIRE_DATE' | 'PROBATION_PASS_DATE';
  /**
   * ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้หรือไม่
   *
   * คนละเรื่องกับ serviceStartBasis ที่ใช้แค่คิดโควตา — ดูคอมเมนต์ที่ assertEligible
   * ไม่ส่งมา = ไม่กั้น เพื่อให้ผู้เรียกเดิมที่ยังไม่รู้จักฟิลด์นี้ได้ผลเหมือนเดิม
   */
  requireProbationPassed?: boolean | null;
  prorateFirstYear: boolean;
  enforceQuotaLimit: boolean;
  quotaAccrualYears: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * LeavePolicyResolverService
 * -----------------------------------------------------------------------------
 * รวม logic การแปล "ค่าที่ตั้งไว้ในหน้านโยบายการทำงาน" ให้เป็นผลจริงกับพนักงาน
 *
 * รับผิดชอบ
 * - เลือก LeavePolicy ที่ตรงกับ สาขา x ประเภทพนักงาน มากที่สุด
 * - แปลง "ระยะเวลาทำงาน / โควตา" (ขั้นบันไดอายุงาน) เป็นจำนวนวันจริง
 * - เฉลี่ยโควตาในปีแรก (prorate) ตามสัดส่วนเดือนที่เหลือ
 * - ตรวจเงื่อนไข ลาล่วงหน้า / เพศ / อายุงานขั้นต่ำ ก่อนให้ยื่นคำขอ
 */
@Injectable()
export class LeavePolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ */
  /* policy selection                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * เลือกนโยบายที่เจาะจงที่สุด: ตรงสาขา (+2) และตรงประเภทพนักงาน (+1)
   * ถ้าไม่มีที่ตรงเลย จะตกไปใช้นโยบายระดับบริษัท / ทุกประเภทพนักงาน
   */
  async resolvePolicy(
    tx: Prisma.TransactionClient | PrismaService,
    params: {
      companyId: string;
      branchId: string | null;
      employeeTypeId: string | null;
      leaveTypeId: string;
    },
  ): Promise<PolicyWithTiers | null> {
    const candidates = await tx.leavePolicy.findMany({
      where: {
        companyId: params.companyId,
        leaveTypeId: params.leaveTypeId,
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
      include: { quotaTiers: { orderBy: { minServiceMonths: 'asc' } } },
      orderBy: [{ createdAt: 'asc' }],
    });

    return this.pickMostSpecific(candidates, params);
  }

  private pickMostSpecific<
    T extends { branchId: string | null; employeeTypeId: string | null },
  >(
    candidates: T[],
    scope: { branchId: string | null; employeeTypeId: string | null },
  ): T | null {
    let best: T | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      const score =
        (scope.branchId && candidate.branchId === scope.branchId ? 2 : 0) +
        (scope.employeeTypeId &&
        candidate.employeeTypeId === scope.employeeTypeId
          ? 1
          : 0);

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  /* ------------------------------------------------------------------ */
  /* quota                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * อายุงานเป็นเดือน นับจากวันที่เริ่มงานหรือวันที่บรรจุ ตามที่ประเภทลากำหนด
   * ยังไม่บรรจุแต่ประเภทลานับจากวันบรรจุ -> คืน null (ยังไม่ได้สิทธิ์)
   */
  serviceMonthsAt(
    employee: Pick<LeaveEligibilityEmployee, 'startDate' | 'probationPassedAt'>,
    basis: 'HIRE_DATE' | 'PROBATION_PASS_DATE',
    asOf: Date,
  ): number | null {
    const anchor =
      basis === 'PROBATION_PASS_DATE'
        ? employee.probationPassedAt
        : employee.startDate;

    if (!anchor) return null;
    if (asOf < anchor) return 0;

    let months =
      (asOf.getFullYear() - anchor.getFullYear()) * 12 +
      (asOf.getMonth() - anchor.getMonth());

    // ยังไม่ถึงวันที่ครบเดือนพอดี ให้ถือว่ายังไม่ครบเดือนนั้น
    if (asOf.getDate() < anchor.getDate()) {
      months -= 1;
    }

    return Math.max(months, 0);
  }

  /**
   * โควตาที่ได้จริงตามอายุงาน — คอลัมน์ "ระยะเวลาทำงาน / โควตา"
   *
   * ไล่ขั้นบันไดจากมากไปน้อย เลือกขั้นสูงสุดที่อายุงานถึง
   * ถ้ายังไม่มีขั้นบันได จะใช้ annualQuotaDays เป็นค่าเดียวเหมือนเดิม
   */
  resolveQuotaDays(
    policy: PolicyWithTiers,
    leaveType: Pick<
      LeaveEligibilityType,
      'serviceStartBasis' | 'prorateFirstYear' | 'code' | 'referenceCode'
    >,
    employee: Pick<LeaveEligibilityEmployee, 'startDate' | 'probationPassedAt'>,
    asOf: Date,
  ): { quotaDays: number; serviceMonths: number | null; prorated: boolean } {
    /*
     * สิทธิลาตามกฎหมายนับอายุงานจากวันเริ่มงานเสมอ ไม่ว่าจะตั้งค่าไว้อย่างไร
     *
     * ถ้าไม่ทำตรงนี้ด้วย จะเกิดสภาพขัดกันเอง คือ assertEligible ปล่อยให้ยื่นได้
     * (เพราะเป็นสิทธิตามกฎหมาย) แต่โควตาที่คำนวณได้เป็น 0 แล้วถูกบล็อกซ้ำ
     * ด้วยเงื่อนไข "ห้ามลาเกินโควตา" ผลลัพธ์สุดท้ายก็ยังลาป่วยไม่ได้อยู่ดี
     */
    const serviceStartBasis = isStatutoryLeave(leaveType)
      ? 'HIRE_DATE'
      : leaveType.serviceStartBasis;

    const serviceMonths = this.serviceMonthsAt(employee, serviceStartBasis, asOf);

    /*
     * ยังไม่บรรจุ แต่ประเภทลานับอายุงานจากวันบรรจุ -> ยังไม่ได้โควตา
     *
     * ต้องเช็คก่อนแตะขั้นบันได เพราะเดิมเช็คอยู่ในกิ่ง tiers.length > 0 อย่างเดียว
     * ทำให้นโยบายที่ไม่มีขั้นบันไดคืนโควตาเต็มให้คนที่ยังไม่บรรจุ ทั้งที่
     * assertEligible บล็อกไม่ให้ยื่นลาประเภทนั้นอยู่แล้ว — ตัวเลขสองที่ขัดกันเอง
     */
    if (serviceMonths === null) {
      return { quotaDays: 0, serviceMonths: null, prorated: false };
    }

    const tiers = [...policy.quotaTiers].sort(
      (a, b) => b.minServiceMonths - a.minServiceMonths,
    );

    let base = Number(policy.annualQuotaDays);

    if (tiers.length > 0) {
      const matched = tiers.find(
        (tier) => serviceMonths >= tier.minServiceMonths,
      );

      base = matched ? Number(matched.quotaDays) : 0;
    }

    if (!leaveType.prorateFirstYear) {
      return {
        quotaDays: this.roundHalf(base),
        serviceMonths,
        prorated: false,
      };
    }

    // เฉลี่ยโควตาในปี : ปีแรกได้ตามสัดส่วนเดือนที่ทำงานจริง
    // เช่น เข้างานกลางปี อายุงานสิ้นปี 6 เดือน -> ได้ครึ่งหนึ่งของโควตาเต็ม
    if (serviceMonths >= 12) {
      return {
        quotaDays: this.roundHalf(base),
        serviceMonths,
        prorated: false,
      };
    }

    const prorated = (base * serviceMonths) / 12;

    return {
      quotaDays: this.roundHalf(prorated),
      serviceMonths,
      prorated: true,
    };
  }

  /** ปัดเป็นครึ่งวัน เพื่อให้โควตาที่เฉลี่ยแล้วยังใช้ยื่นครึ่งวันได้ */
  private roundHalf(value: number) {
    return Math.round(value * 2) / 2;
  }

  /* ------------------------------------------------------------------ */
  /* eligibility                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * ตรวจเงื่อนไขระดับประเภทลาก่อนให้ยื่นคำขอ
   * โยน BadRequest พร้อมข้อความภาษาไทยที่บอกได้ว่าติดเงื่อนไขข้อไหน
   */
  assertEligible(params: {
    leaveType: LeaveEligibilityType;
    employee: Pick<
      LeaveEligibilityEmployee,
      'profile' | 'startDate' | 'probationPassedAt'
    >;
    startDate: Date;
    /** true = คำขอย้อนหลัง ไม่ต้องตรวจลาล่วงหน้า */
    isRetroactive: boolean;
    /** วันที่อ้างอิงตอนยื่น (ปกติคือวันนี้) */
    submittedOn?: Date;
  }) {
    const { leaveType, employee, startDate } = params;

    // ลาได้เฉพาะเพศชาย / เฉพาะเพศหญิง
    if (leaveType.genderEligibility !== 'ALL') {
      if (employee.profile?.gender !== leaveType.genderEligibility) {
        const label =
          leaveType.genderEligibility === 'FEMALE'
            ? 'พนักงานหญิง'
            : 'พนักงานชาย';
        throw new BadRequestException(
          `${leaveType.nameTh} ใช้สิทธิ์ได้เฉพาะ${label}`,
        );
      }
    }

    /*
     * ต้องผ่านการบรรจุก่อนถึงจะยื่นลาประเภทนี้ได้
     *
     * ดูที่ requireProbationPassed อย่างเดียว ไม่ดู serviceStartBasis
     * ของเดิมใช้ serviceStartBasis ตัวเดียวทำสองหน้าที่ปนกัน คือทั้งฐานนับอายุงาน
     * เพื่อคิดโควตา และด่านบล็อกไม่ให้ยื่น HR ที่ตั้งให้ลาพักร้อนนับจากวันบรรจุ
     * จึงเผลอบล็อกลาป่วยกับลาคลอดของพนักงานทดลองงานไปด้วยโดยไม่มีอะไรเตือน
     *
     * ยกเว้นสิทธิลาที่กฎหมายให้ไว้ (ลาป่วย ม.32 · ลาคลอด ม.41 · ลากิจจำเป็น ม.34 ฯลฯ)
     * ซึ่งผูกกับการผ่านทดลองงานไม่ได้ ต่อให้ HR กดเปิดปุ่มนี้ก็เอาชนะไม่ได้
     */
    if (
      leaveType.requireProbationPassed === true &&
      !employee.probationPassedAt &&
      !isStatutoryLeave(leaveType)
    ) {
      throw new BadRequestException(
        `${leaveType.nameTh} ใช้สิทธิ์ได้เมื่อผ่านการบรรจุแล้วเท่านั้น`,
      );
    }

    /*
     * ลาล่วงหน้า — ต้องยื่นก่อนวันลาอย่างน้อยกี่วัน
     *
     * "วันล่วงหน้า" นับเฉพาะวันเต็มระหว่างวันที่ยื่นกับวันเริ่มลา ไม่นับวันที่ยื่นเอง
     * เช่น ตั้งไว้ 1 วัน ยื่นวันที่ 10 → ลาได้เร็วสุดวันที่ 12 (วันที่ 11 คือ 1 วันล่วงหน้า)
     *
     * ป่วยและคลอดเป็นเหตุที่คาดล่วงหน้าไม่ได้ ถ้าบังคับ จะยื่นใบลาไม่ได้เลย
     */
    if (
      !params.isRetroactive &&
      leaveType.advanceNoticeDays > 0 &&
      !isUnschedulableLeave(leaveType)
    ) {
      const today = this.dateOnly(params.submittedOn ?? new Date());
      const target = this.dateOnly(startDate);
      const noticeDays =
        Math.floor((target.getTime() - today.getTime()) / MS_PER_DAY) - 1;

      if (noticeDays < leaveType.advanceNoticeDays) {
        throw new BadRequestException(
          `${leaveType.nameTh} ต้องยื่นล่วงหน้าอย่างน้อย ${leaveType.advanceNoticeDays.toLocaleString('th-TH')} วัน ไม่นับวันที่ยื่น` +
            ` (คำขอนี้ล่วงหน้า ${Math.max(noticeDays, 0).toLocaleString('th-TH')} วัน)`,
        );
      }
    }
  }

  /**
   * ตรวจจำนวนวันลาติดต่อกันสูงสุดของนโยบาย
   */
  assertWithinConsecutiveLimit(params: {
    leaveTypeName: string;
    policy: Pick<PolicyWithTiers, 'maxConsecutiveDays'>;
    totalDays: number;
  }) {
    const limit = params.policy.maxConsecutiveDays;
    if (!limit || limit <= 0) return;

    if (params.totalDays > limit) {
      throw new BadRequestException(
        `${params.leaveTypeName} ลาติดต่อกันได้ไม่เกิน ${limit.toLocaleString('th-TH')} วัน`,
      );
    }
  }

  /**
   * ตัดเวลาออกตามปฏิทินไทย
   *
   * ใช้เทียบ "วันนี้" กับวันที่เริ่มลา เพื่อนับว่ายื่นล่วงหน้ากี่วัน
   * ของเดิมใช้เวลาเซิร์ฟเวอร์ บน UTC ช่วง 00:00-07:00 ตามเวลาไทย
   * จะได้วันเมื่อวาน ทำให้จำนวนวันล่วงหน้าคลาดไป 1 วัน
   */
  private dateOnly(value: Date) {
    return toThaiDateOnly(value);
  }
}
