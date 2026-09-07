import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';

/**
 * แบบคำนวณค่าจ้างประกอบการรายงานค่าจ้าง กท.20
 * -----------------------------------------------------------------------------
 * เอกสารนี้ยื่นปีละครั้งคู่กับแบบ กท.20 ก เพื่อแจ้งค่าจ้างทั้งปีของสถานประกอบการ
 * ให้กองทุนเงินทดแทนใช้คิดเงินสมทบ ซึ่งคิดคนละฐานกับประกันสังคมโดยสิ้นเชิง
 *
 *   ประกันสังคม        ค่าจ้างรายเดือน เพดาน 17,500 บาท/คน/เดือน
 *   กองทุนเงินทดแทน   ค่าจ้างรายเดือน เพดาน 20,000 บาท/คน/เดือน
 *
 * และนิยาม "ค่าจ้าง" ก็ต่างกัน — กองทุนเงินทดแทน **ไม่นับค่าล่วงเวลาและโบนัส**
 * เป็นค่าจ้าง (ระบุไว้ในหัวตารางของแบบ) แต่ต้องรายงานค่าล่วงเวลาแยกในช่อง (จ)
 * ซึ่งเป็นยอดตามแบบ ภ.ง.ด.1ก ที่รวมทุกอย่าง
 */

/** เพดานค่าจ้างต่อคนต่อเดือนของกองทุนเงินทดแทน */
const MONTHLY_WAGE_CAP = 20_000;

const THAI_MONTH_ABBR = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * ประเภทเงินได้ที่ "ไม่ใช่ค่าจ้าง" ตามกฎหมายกองทุนเงินทดแทน
 * ตัดออกจากช่อง (ข) แต่ยังนับในช่อง (จ) ซึ่งเป็นยอดตาม ภ.ง.ด.1ก
 */
const NON_WAGE_SOURCES = new Set(['OVERTIME', 'BONUS']);

export type WorkmenMonthRow = {
  month: number;
  monthLabel: string;
  employeeCount: number;
  /** ค่าจ้างของพนักงานรายเดือน */
  monthlySalary: number;
  /** ค่าจ้างของพนักงานรายวันและรายชั่วโมง */
  dailyWage: number;
  /** เงินได้อื่นที่ยังนับเป็นค่าจ้าง เช่น ค่าตำแหน่ง ค่าครองชีพ */
  otherIncome: number;
  /** (1) รวมค่าจ้าง */
  totalWage: number;
  /** (2) ส่วนที่เกินเพดาน 20,000/คน/เดือน รวมของทุกคน */
  excessOverCap: number;
  /** (3) = (1) - (2) ค่าจ้างสุทธิที่ต้องแจ้ง */
  netWage: number;
};

/**
 * หนึ่งบรรทัดของแบบ กท.20ก — รายชื่อลูกจ้างพร้อมค่าจ้างที่ต้องแจ้งทั้งปี
 * ยื่นแนบไปกับ กท.20 ยอดรวมของคอลัมน์นี้ต้องเท่ากับช่อง (ค) ของ กท.20 พอดี
 */
export type WorkmenEmployeeRow = {
  employeeId: string;
  /** "คำนำหน้า ชื่อ นามสกุล" ตามรูปแบบในไฟล์ตัวอย่าง */
  fullName: string;
  companyName: string;
  branchName: string;
  departmentName: string;
  divisionName: string;
  unitName: string;
  positionName: string;
  /** ประเภทพนักงาน อ่านจากฐานการจ่าย (รายเดือน/รายวัน/รายชั่วโมง) */
  employmentType: string;
  /** ค่าจ้างทั้งปีหลังตัดเพดานรายเดือนแล้ว */
  reportableWage: number;
};

export type WorkmenCompensationReport = {
  /** ปี พ.ศ. ที่รายงาน */
  buddhistYear: number;
  gregorianYear: number;
  company: {
    id: string;
    code: string | null;
    nameTh: string | null;
    nameEn: string | null;
    /* ใช้ทำหัวจดหมายของ กท.20ก ให้โทนเดียวกับเอกสารเงินเดือนใบอื่น */
    logoUrl: string | null;
    taxId: string | null;
    address: string | null;
    email: string | null;
    socialSecurityAccountNo: string | null;
    socialSecurityBranchNo: string | null;
    workmenCompensationCode: string | null;
    workmenCompensationRate: number | null;
    phone: string | null;
  };
  months: WorkmenMonthRow[];
  totals: Omit<WorkmenMonthRow, 'month' | 'monthLabel' | 'employeeCount'>;
  /** (ง) ค่าจ้างต่ำสุดที่พบในปีนั้น */
  lowest: {
    monthlySalary: number;
    dailyWage: number;
  };
  /** (จ) ยอดตามแบบ ภ.ง.ด.1ก ของทั้งปี — รวมค่าล่วงเวลาและโบนัสด้วย */
  annualTaxSummary: {
    employeeCount: number;
    totalIncome: number;
    monthlySalary: number;
    dailyWage: number;
    otherIncome: number;
    overtime: number;
  };
  /** รายชื่อลูกจ้างสำหรับแบบ กท.20ก เรียงตามค่าจ้างมากไปน้อย */
  employees: WorkmenEmployeeRow[];
  employeeTotals: {
    count: number;
    reportableWage: number;
  };
  /** ข้อมูลบริษัทที่ยังขาด ต้องเติมก่อนยื่นจริง */
  missingCompanyFields: string[];
};

function toNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * ช่อง "ประเภทพนักงาน" ของแบบ กท.20ก
 * ระบบไม่มีฟิลด์ประเภทพนักงานแยกต่างหาก จึงอ่านจากฐานการจ่ายค่าจ้างซึ่งเป็นสิ่งที่
 * แบบฟอร์มต้องการจริง ๆ (ไฟล์ตัวอย่างมี "เหมาจ่าย" ด้วย แต่ระบบยังไม่มีฐานแบบนั้น)
 */
const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  MONTHLY: 'พนักงานรายเดือน',
  DAILY: 'พนักงานรายวัน',
  HOURLY: 'พนักงานรายชั่วโมง',
};

/** ข้อมูลพนักงานเท่าที่แบบ กท.20ก ต้องใช้ ประกาศแยกเพื่อไม่ผูกกับชนิดที่ Prisma สร้าง */
type EmployeeSnapshot = {
  title: string | null;
  firstName: string;
  lastName: string;
  position: string | null;
  company: { nameTh: string | null } | null;
  branch: { nameTh: string } | null;
  department: { nameTh: string } | null;
  division: { nameTh: string } | null;
  positionMaster: { nameTh: string } | null;
} | null;

/**
 * สร้างบรรทัดเปล่าของพนักงานหนึ่งคน ยอดค่าจ้างค่อยบวกทีหลังทีละเดือน
 *
 * ไฟล์ตัวอย่างวาง "สำนักงานสาขา" ไว้คนละช่องกับ "บริษัท" แต่ถ้าพนักงานไม่ได้สังกัด
 * สาขาใด ตัวอย่างก็ใส่ชื่อบริษัทซ้ำลงไป ไม่ได้เว้นว่าง จึง fallback ตามนั้น
 */
function buildEmployeeRow(
  employeeId: string,
  employee: EmployeeSnapshot,
  salaryBasis: string | null | undefined,
): WorkmenEmployeeRow {
  const companyName = employee?.company?.nameTh ?? '';

  return {
    employeeId,
    fullName: [employee?.title, employee?.firstName, employee?.lastName]
      .filter((part) => part && String(part).trim())
      .join(' ')
      .trim(),
    companyName,
    branchName: employee?.branch?.nameTh ?? companyName,
    departmentName: employee?.department?.nameTh ?? '',
    divisionName: employee?.division?.nameTh ?? '',
    /*
     * ยังไม่มีตาราง "หน่วยงาน" ในระบบ (โครงสร้างคือ สาขา > แผนก > ฝ่าย)
     * ไฟล์ตัวอย่างเองก็เว้นช่องนี้ว่างทุกแถว จึงคงคอลัมน์ไว้ให้ครบรูปแบบเท่านั้น
     */
    unitName: '',
    positionName: employee?.positionMaster?.nameTh ?? employee?.position ?? '',
    employmentType:
      EMPLOYMENT_TYPE_LABEL[String(salaryBasis)] ?? 'พนักงานรายเดือน',
    reportableWage: 0,
  };
}

@Injectable()
export class PayrollWorkmenCompensationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    companyId: string,
    gregorianYear: number,
    scope: TenantScope,
  ): Promise<WorkmenCompensationReport> {
    /*
     * ทั้งระบบเก็บปีเป็น ค.ศ. (PayrollPeriod.year, PayrollTaxYear.taxYear) จึงรับ
     * ค.ศ. เข้ามาตรง ๆ แล้วค่อยแปลงเป็น พ.ศ. ตอนพิมพ์ลงแบบฟอร์มราชการเท่านั้น
     * ถ้ารับเป็น พ.ศ. จะลบ 543 ไปชนปีที่ไม่มีงวดจริง แล้วได้ฟอร์มเปล่าทั้งใบ
     */
    const buddhistYear = gregorianYear + 543;

    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        ...(scope.companyId ? { id: scope.companyId } : {}),
      },
      select: {
        id: true,
        code: true,
        nameTh: true,
        nameEn: true,
        logoUrl: true,
        taxId: true,
        address: true,
        email: true,
        phone: true,
        socialSecurityAccountNo: true,
        socialSecurityBranchNo: true,
        workmenCompensationCode: true,
        workmenCompensationRate: true,
      },
    });

    if (!company) {
      throw new Error('ไม่พบบริษัทตามที่ระบุ หรืออยู่นอกขอบเขตของผู้ใช้');
    }

    /*
     * ดึงรายการเงินเดือนทั้งปีทีเดียว แล้วค่อยแยกเป็นเดือนในหน่วยความจำ
     * ยิงทีละเดือน 12 ครั้งจะได้ผลเท่ากันแต่ช้ากว่ามากเมื่อพนักงานหลักร้อย
     */
    const items = await this.prisma.payrollItem.findMany({
      where: {
        status: { not: 'CANCELLED' },
        run: {
          deletedAt: null,
          companyId: company.id,
          period: { year: gregorianYear },
          ...(scope.branchId ? { branchIds: { has: scope.branchId } } : {}),
        },
      },
      select: {
        employeeId: true,
        compensation: { select: { salaryBasis: true } },
        run: { select: { period: { select: { month: true } } } },
        employee: {
          select: {
            title: true,
            firstName: true,
            lastName: true,
            position: true,
            company: { select: { nameTh: true } },
            branch: { select: { nameTh: true } },
            department: { select: { nameTh: true } },
            division: { select: { nameTh: true } },
            positionMaster: { select: { nameTh: true } },
          },
        },
        lines: {
          where: { type: 'EARNING' },
          select: { sourceType: true, amount: true },
        },
      },
    });

    const byMonth = new Map<number, WorkmenMonthRow>();
    const employeesByMonth = new Map<number, Set<string>>();

    /*
     * ตัวสะสมรายคนสำหรับแบบ กท.20ก
     * ต้องตัดเพดานรายเดือนก่อนแล้วค่อยบวกสะสม ไม่ใช่บวกทั้งปีแล้วตัดทีเดียว
     * เพราะเพดานเป็น 20,000 "ต่อคนต่อเดือน" คนที่ค่าจ้างขึ้น ๆ ลง ๆ จะได้ยอดคนละเลข
     */
    const byEmployee = new Map<string, WorkmenEmployeeRow>();

    /* ยอดของช่อง (จ) — ตาม ภ.ง.ด.1ก จึงรวมค่าล่วงเวลาและโบนัสเข้าไปด้วย */
    const annual = {
      employees: new Set<string>(),
      totalIncome: 0,
      monthlySalary: 0,
      dailyWage: 0,
      otherIncome: 0,
      overtime: 0,
    };

    for (let month = 1; month <= 12; month++) {
      byMonth.set(month, {
        month,
        monthLabel: THAI_MONTH_ABBR[month - 1],
        employeeCount: 0,
        monthlySalary: 0,
        dailyWage: 0,
        otherIncome: 0,
        totalWage: 0,
        excessOverCap: 0,
        netWage: 0,
      });
      employeesByMonth.set(month, new Set());
    }

    for (const item of items) {
      const month = item.run.period.month;
      const row = byMonth.get(month);
      if (!row) continue;

      employeesByMonth.get(month)?.add(item.employeeId);
      annual.employees.add(item.employeeId);

      const isDailyBasis = item.compensation?.salaryBasis !== 'MONTHLY';

      /** ค่าจ้างของคนนี้ในเดือนนี้ ใช้ตัดเพดาน 20,000 รายคน */
      let personWage = 0;

      for (const line of item.lines) {
        const amount = toNumber(line.amount);
        const source = String(line.sourceType);

        if (source === 'OVERTIME') annual.overtime += amount;
        annual.totalIncome += amount;

        // ค่าล่วงเวลาและโบนัสไม่ใช่ค่าจ้างของกองทุนเงินทดแทน
        if (NON_WAGE_SOURCES.has(source)) continue;

        personWage += amount;

        if (source === 'BASE_SALARY') {
          if (isDailyBasis) {
            row.dailyWage += amount;
            annual.dailyWage += amount;
          } else {
            row.monthlySalary += amount;
            annual.monthlySalary += amount;
          }
        } else {
          row.otherIncome += amount;
          annual.otherIncome += amount;
        }
      }

      row.totalWage += personWage;
      row.excessOverCap += Math.max(0, personWage - MONTHLY_WAGE_CAP);

      const person =
        byEmployee.get(item.employeeId) ??
        buildEmployeeRow(
          item.employeeId,
          item.employee,
          item.compensation?.salaryBasis,
        );
      person.reportableWage += Math.min(personWage, MONTHLY_WAGE_CAP);
      byEmployee.set(item.employeeId, person);
    }

    /*
     * (ง) ต้องเป็น "อัตรา" ค่าจ้าง ไม่ใช่ยอดที่จ่ายจริงทั้งเดือน
     *
     * ช่องนี้ให้เจ้าหน้าที่ตรวจว่าค่าจ้างต่ำกว่าค่าแรงขั้นต่ำหรือไม่ จึงต้องอ่านจาก
     * อัตราในสัญญาจ้าง ถ้าเอายอดรวมทั้งเดือนของพนักงานรายวันมาใส่ จะได้เลขหลักหมื่น
     * ในช่องที่เขียนว่า "วันละ" ซึ่งอ่านแล้วผิดความหมายทันที
     */
    const lowest = await this.getLowestWageRates(company.id, gregorianYear);

    const months = Array.from(byMonth.values()).map((row) => {
      const employeeCount = employeesByMonth.get(row.month)?.size ?? 0;

      return {
        ...row,
        employeeCount,
        monthlySalary: round2(row.monthlySalary),
        dailyWage: round2(row.dailyWage),
        otherIncome: round2(row.otherIncome),
        totalWage: round2(row.totalWage),
        excessOverCap: round2(row.excessOverCap),
        netWage: round2(row.totalWage - row.excessOverCap),
      };
    });

    const sum = (pick: (row: WorkmenMonthRow) => number) =>
      round2(months.reduce((total, row) => total + pick(row), 0));

    /*
     * คนที่ค่าจ้างทั้งปีเป็นศูนย์ไม่ต้องขึ้นในแบบ กท.20ก
     * เช่นคนที่เดือนนั้นได้เฉพาะค่าล่วงเวลาหรือโบนัส ซึ่งไม่ใช่ค่าจ้างของกองทุนนี้
     * ในไฟล์ตัวอย่างจึงมี 90 คน ทั้งที่ ภ.ง.ด.1ก นับได้ 142 ราย
     */
    const employees = Array.from(byEmployee.values())
      .map((row) => ({ ...row, reportableWage: round2(row.reportableWage) }))
      .filter((row) => row.reportableWage > 0)
      .sort(
        (a, b) =>
          b.reportableWage - a.reportableWage ||
          a.fullName.localeCompare(b.fullName, 'th'),
      );

    return {
      buddhistYear,
      gregorianYear,
      company: {
        ...company,
        workmenCompensationRate:
          company.workmenCompensationRate === null
            ? null
            : toNumber(company.workmenCompensationRate),
      },
      months,
      totals: {
        monthlySalary: sum((row) => row.monthlySalary),
        dailyWage: sum((row) => row.dailyWage),
        otherIncome: sum((row) => row.otherIncome),
        totalWage: sum((row) => row.totalWage),
        excessOverCap: sum((row) => row.excessOverCap),
        netWage: sum((row) => row.netWage),
      },
      lowest,
      annualTaxSummary: {
        employeeCount: annual.employees.size,
        totalIncome: round2(annual.totalIncome),
        monthlySalary: round2(annual.monthlySalary),
        dailyWage: round2(annual.dailyWage),
        otherIncome: round2(annual.otherIncome),
        overtime: round2(annual.overtime),
      },
      employees,
      employeeTotals: {
        count: employees.length,
        reportableWage: round2(
          employees.reduce((total, row) => total + row.reportableWage, 0),
        ),
      },
      missingCompanyFields: [
        company.workmenCompensationCode ? null : 'รหัสกิจการ',
        company.workmenCompensationRate ? null : 'อัตราเงินสมทบกองทุนเงินทดแทน',
        company.socialSecurityAccountNo ? null : 'เลขที่บัญชีนายจ้าง',
      ].filter((value): value is string => Boolean(value)),
    };
  }

  /**
   * อัตราค่าจ้างต่ำสุดที่ใช้อยู่ในปีนั้น แยกตามฐานค่าจ้าง
   *
   * อ่านจากสัญญาจ้างที่ยังมีผลในปีนั้น ไม่ใช่จากยอดที่จ่ายจริง เพราะช่องนี้ในแบบ
   * ระบุหน่วยไว้ชัดว่า "เดือนละ" กับ "วันละ" — เป็นอัตรา ไม่ใช่ยอดสะสม
   */
  private async getLowestWageRates(companyId: string, gregorianYear: number) {
    const yearStart = new Date(Date.UTC(gregorianYear, 0, 1));
    const yearEnd = new Date(Date.UTC(gregorianYear, 11, 31));

    const rateOf = async (basis: 'MONTHLY' | 'DAILY') => {
      const row = await this.prisma.employeeCompensation.findFirst({
        where: {
          salaryBasis: basis,
          baseSalary: { gt: 0 },
          companyId,
          effectiveDate: { lte: yearEnd },
          OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
        },
        orderBy: { baseSalary: 'asc' },
        select: { baseSalary: true },
      });

      return row ? round2(toNumber(row.baseSalary)) : 0;
    };

    return {
      monthlySalary: await rateOf('MONTHLY'),
      dailyWage: await rateOf('DAILY'),
    };
  }
}
