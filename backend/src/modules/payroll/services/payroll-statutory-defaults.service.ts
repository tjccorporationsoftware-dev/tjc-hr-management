import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import {
  DEFAULT_ALLOWANCE_LIMIT_GROUPS,
  DEFAULT_ALLOWANCE_TYPES,
} from '../constants/payroll-tax-allowance-defaults';
import {
  STATUTORY_TAX_BRACKETS,
  STATUTORY_TAX_YEAR_DEFAULTS,
} from '../constants/statutory-payroll-defaults.constant';

/**
 * PayrollStatutoryDefaultsService
 * -----------------------------------------------------------------------------
 * ทำให้ "โครงสร้างภาษี" ในหน้าตั้งค่าเงินเดือน เป็นค่าคงที่ของระบบตามกฎหมาย
 * ไม่ใช่สิ่งที่แต่ละบริษัทต้องมานั่งสร้างเองก่อนถึงจะใช้งานได้
 *
 * เดิมขั้นภาษีจะถูกใส่ให้ก็ต่อเมื่อมีคนกด "สร้างปีภาษี" เอง บริษัทที่ยังไม่เคยกด
 * เปิดแท็บมาเจอ "ยังไม่มีปีภาษี" ทั้งที่ค่าที่ถูกต้องตามกฎหมายมีอยู่ในระบบแล้ว
 * และตัวคำนวณภาษีก็ทำงานไม่ได้เพราะไม่มีปีภาษีให้ยึด
 *
 * ตัวนี้จึงเติมปีภาษีของปีปัจจุบันให้ทุกบริษัทที่ยังไม่มี พร้อมขั้นภาษี
 * กลุ่มเพดานค่าลดหย่อน และประเภทค่าลดหย่อนตั้งต้น
 *
 * **เติมให้เฉพาะบริษัทที่ยังไม่มีเท่านั้น** ของที่บริษัทแก้ไปแล้วจะไม่ถูกทับ
 *
 * ส่วนบันไดค่าชดเชย (ม.118) ไม่ต้องเติมลงฐานข้อมูล เพราะเครื่องคำนวณใช้
 * ขั้นต่ำตามกฎหมายให้อยู่แล้วเมื่อบริษัทยังไม่ได้ตั้งเอง (`usingStatutoryDefault`)
 * การไปสร้าง `CompanyPayrollSetting` ให้ทุกบริษัทจะมีผลข้างเคียงที่ไม่เกี่ยวกัน คือ
 * ทำให้บริษัทนั้นหลุดจากค่ากลางของระบบในเรื่องอื่น (รอบตัดยอด/ฐานหาร/ประกันสังคม)
 * ไปเป็นค่าที่ตรึงไว้ของตัวเองทันที
 */
@Injectable()
export class PayrollStatutoryDefaultsService implements OnModuleInit {
  private readonly logger = new Logger(PayrollStatutoryDefaultsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    /*
     * ไม่ให้การเติมค่าล้มแล้วแอปบูตไม่ขึ้น
     * ฐานข้อมูลยังไม่พร้อม (migrate ยังไม่ผ่าน) ให้เขียน log แล้วปล่อยผ่าน
     * รอบบูตถัดไปจะเติมใหม่เอง
     */
    try {
      const result = await this.ensureAllCompanies();

      if (result.created > 0 || result.repaired > 0) {
        this.logger.log(
          `โครงสร้างภาษีตามกฎหมาย — เติมให้บริษัทใหม่ ${result.created} ` +
            `· เติมขั้นภาษีที่ว่างอยู่ ${result.repaired} ปีภาษี ` +
            `(ตรวจทั้งหมด ${result.checked} บริษัท)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'เติมโครงสร้างภาษีตามกฎหมายไม่สำเร็จ — จะลองใหม่ตอนบูตครั้งถัดไป',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** ไล่เติมให้ทุกบริษัทที่ยังใช้งานอยู่ */
  async ensureAllCompanies() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    let created = 0;

    for (const company of companies) {
      if (await this.ensureCompanyDefaults(company.id)) {
        created += 1;
      }
    }

    const repaired = await this.repairEmptyTaxYears();

    return { checked: companies.length, created, repaired };
  }

  /**
   * ปีภาษีที่มีอยู่แล้วแต่ไม่มีขั้นภาษีสักขั้น
   *
   * สภาพนี้ทำให้คิดภาษีไม่ได้เลยทั้งที่หน้าจอแสดงว่ามีปีภาษีอยู่ และไม่ใช่
   * การตั้งค่าที่ถูกต้องได้ในทางใดเลย (ขั้นภาษีเป็นโครงตามกฎหมาย ไม่ใช่ตัวเลือก)
   * จึงเติมชุดตามกฎหมายกลับให้ — เติมเฉพาะที่ว่างเปล่า ไม่แตะของที่บริษัทแก้ไว้
   */
  private async repairEmptyTaxYears() {
    const prisma = this.prisma as any;

    const taxYears: Array<{ id: string }> = await prisma.payrollTaxYear.findMany({
      where: { deletedAt: null, brackets: { none: { deletedAt: null } } },
      select: { id: true },
    });

    for (const taxYear of taxYears) {
      await this.seedTaxYearContent(taxYear.id);
    }

    return taxYears.length;
  }

  /**
   * เติมโครงสร้างภาษีตามกฎหมายให้บริษัทหนึ่ง
   *
   * คืน true เมื่อมีการสร้างใหม่จริง — ใช้ตอนสร้างบริษัทใหม่ด้วย
   * จะได้ไม่ต้องรอรีสตาร์ตแอปก่อนถึงจะใช้งานหน้าภาษีได้
   *
   * เกณฑ์คือ "บริษัทนี้ยังไม่มีปีภาษีสักปี" ไม่ใช่ "ยังไม่มีปีนี้" โดยตั้งใจ
   * บริษัทที่ตั้งปีภาษีไว้แล้วแต่ยังไม่ได้เปิดปีใหม่ ถือเป็นการตัดสินใจของเขา
   * ระบบไม่ควรแอบเปิดปีใหม่ให้ เพราะกระทบการคำนวณภาษีของงวดที่กำลังทำอยู่
   */
  async ensureCompanyDefaults(companyId: string) {
    const prisma = this.prisma as any;

    const existing = await prisma.payrollTaxYear.count({
      where: { companyId, deletedAt: null },
    });

    if (existing > 0) return false;

    const year = new Date().getFullYear();

    const taxYear = await prisma.payrollTaxYear.create({
      data: {
        companyId,
        taxYear: year,
        code: `TAX-${year}`,
        name: `ปีภาษี ${year}`,
        // ปีภาษีไทยคือปีปฏิทิน — 1 ม.ค. ถึง 31 ธ.ค.
        startDate: new Date(Date.UTC(year, 0, 1)),
        endDate: new Date(Date.UTC(year, 11, 31)),
        personalExpenseRate: STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseRate,
        personalExpenseMax: STATUTORY_TAX_YEAR_DEFAULTS.personalExpenseMax,
        standardPersonalAllowance:
          STATUTORY_TAX_YEAR_DEFAULTS.standardPersonalAllowance,
        roundingMethod: STATUTORY_TAX_YEAR_DEFAULTS.roundingMethod,
        taxAveragingMethod: STATUTORY_TAX_YEAR_DEFAULTS.taxAveragingMethod,
        isActive: true,
        status: 'ACTIVE',
        note: 'ระบบสร้างให้ตามโครงสร้างภาษีในกฎหมาย ปรับแก้ได้ตามที่บริษัทใช้จริง',
      },
      select: { id: true },
    });

    await this.seedTaxYearContent(taxYear.id);

    return true;
  }

  /**
   * ขั้นภาษี + กลุ่มเพดาน + ประเภทค่าลดหย่อน ของปีภาษีหนึ่ง
   *
   * แยกเป็นเมธอดสาธารณะเพราะปีภาษีที่ผู้ใช้สร้างเองก็ต้องได้ชุดเดียวกัน
   * (ดู `PayrollTaxService.createTaxYear`) ไม่งั้นสองทางเข้าจะได้ค่าคนละชุด
   */
  async seedTaxYearContent(taxYearId: string) {
    const prisma = this.prisma as any;

    const bracketCount = await prisma.payrollTaxBracket.count({
      where: { taxYearId, deletedAt: null },
    });

    if (!bracketCount) {
      await prisma.payrollTaxBracket.createMany({
        data: STATUTORY_TAX_BRACKETS.map((row) => ({ taxYearId, ...row })),
      });
    }

    // กลุ่มเพดานต้องมีก่อนประเภทค่าลดหย่อน เพราะประเภทอ้างถึงรหัสกลุ่ม
    const groupCount = await prisma.payrollTaxAllowanceLimitGroup.count({
      where: { taxYearId, deletedAt: null },
    });

    if (!groupCount) {
      await prisma.payrollTaxAllowanceLimitGroup.createMany({
        data: DEFAULT_ALLOWANCE_LIMIT_GROUPS.map((row) => ({
          taxYearId,
          ...row,
          status: 'ACTIVE',
        })),
      });
    }

    const typeCount = await prisma.payrollTaxAllowanceType.count({
      where: { taxYearId, deletedAt: null },
    });

    if (!typeCount) {
      await prisma.payrollTaxAllowanceType.createMany({
        data: DEFAULT_ALLOWANCE_TYPES.map((row) => ({
          taxYearId,
          status: 'ACTIVE',
          ...row,
        })),
      });
    }
  }
}
