import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  LEAVE_TYPE_CATALOG,
  LEGACY_LEAVE_CODE_TO_REFERENCE_CODE,
  type LeaveTypeCatalogEntry,
} from '../constants/leave-type-catalog.constant';

/**
 * LeaveTypeCatalogBootstrapService
 * -----------------------------------------------------------------------------
 * ทำให้ "ประเภทการลามาตรฐาน" เป็นค่าคงที่ของระบบจริง ๆ ไม่ใช่ข้อมูล seed
 *
 * แหล่งความจริงคือ `constants/leave-type-catalog.constant.ts` ในโค้ด
 * ส่วนตาราง `leave_type_catalog` เป็นแค่สำเนาที่ต้องมี เพราะ `LeaveType.catalogId`
 * ของบริษัทเป็น foreign key ชี้มาที่ตารางนี้
 *
 * ตัวนี้จึงซิงก์ค่าคงที่ลงตารางทุกครั้งที่แอปบูต ผลคือ
 *  - ตั้งฐานข้อมูลใหม่ / reset / ล้างข้อมูล แล้วรายการกลับมาเองรอบถัดไป ไม่ต้องสั่ง seed
 *  - บริษัทที่เพิ่งสร้างเห็นตัวเลือกครบทุกประเภททันที แล้วไปเปิดใช้/ตั้งโควตาของตัวเอง
 *  - แก้รายการมาตรฐานที่ไฟล์ค่าคงที่ที่เดียว รีสตาร์ตแล้วมีผลทั้งระบบ
 *
 * ไม่แตะข้อมูลของบริษัท — `LeaveType` / `LeavePolicy` / โควตา เป็นคนละแถวกัน
 * บริษัทที่ตั้งค่าเองไว้แล้วจะไม่ถูกเขียนทับ
 */
@Injectable()
export class LeaveTypeCatalogBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(LeaveTypeCatalogBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    /*
     * ไม่ให้การซิงก์ล้มแล้วแอปบูตไม่ขึ้น
     *
     * ถ้าฐานข้อมูลยังไม่พร้อม (migrate ยังไม่ผ่าน / DB ยังไม่ขึ้น) ให้เขียน log
     * แล้วปล่อยผ่าน รอบบูตถัดไปจะซิงก์ใหม่เอง ดีกว่าทำให้ทั้งระบบขึ้นไม่ได้
     * เพราะรายการประเภทลาชุดหนึ่ง
     */
    try {
      const result = await this.syncCatalog();
      const link = await this.linkCompanyLeaveTypes();

      this.logger.log(
        `ประเภทการลามาตรฐาน ${result.total} รายการพร้อมใช้งาน ` +
          `(เพิ่ม ${result.created} · อัปเดต ${result.updated}` +
          (link.linked > 0 ? ` · ผูกประเภทเดิม ${link.linked}` : '') +
          ')',
      );
    } catch (error) {
      this.logger.error(
        'ซิงก์ประเภทการลามาตรฐานไม่สำเร็จ — จะลองใหม่ตอนบูตครั้งถัดไป',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * เขียนค่าคงที่ลงตาราง — รันซ้ำได้ (upsert ด้วย `referenceCode`)
   */
  private async syncCatalog() {
    let created = 0;
    let updated = 0;

    for (const [index, entry] of LEAVE_TYPE_CATALOG.entries()) {
      const data = this.toCatalogRow(entry, index);

      const existing = await this.prisma.leaveTypeCatalog.findUnique({
        where: { referenceCode: entry.referenceCode },
        select: { id: true },
      });

      await this.prisma.leaveTypeCatalog.upsert({
        where: { referenceCode: entry.referenceCode },
        update: data,
        create: { referenceCode: entry.referenceCode, ...data },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return { created, updated, total: LEAVE_TYPE_CATALOG.length };
  }

  /**
   * ผูกประเภทลาเดิมของบริษัท (ที่ยังไม่มี `catalogId`) เข้ากับรายการมาตรฐาน
   *
   * ปลอดภัยต่อข้อมูลเดิม — เขียนแค่ `catalogId` กับ `referenceCode`
   * ไม่แตะชื่อ โควตา นโยบาย หรือใบลาที่ผูกอยู่
   *
   * ข้ามให้เมื่อ
   *  - ประเภทนั้นผูก catalog ไว้แล้ว
   *  - รหัสไม่มีคู่ในตารางจับคู่ (ถือเป็นประเภทที่บริษัทสร้างเอง)
   *  - บริษัทนั้นมีประเภทอื่นผูกกับ catalog แถวเดียวกันไปแล้ว (กันผูกซ้อน)
   */
  private async linkCompanyLeaveTypes() {
    const unlinked = await this.prisma.leaveType.findMany({
      where: { deletedAt: null, catalogId: null },
      select: { id: true, companyId: true, code: true },
      orderBy: { createdAt: 'asc' },
    });

    if (unlinked.length === 0) {
      return { linked: 0, skipped: 0 };
    }

    const catalogRows = await this.prisma.leaveTypeCatalog.findMany({
      where: { deletedAt: null },
      select: { id: true, referenceCode: true },
    });

    const catalogByReferenceCode = new Map(
      catalogRows.map((row) => [row.referenceCode, row]),
    );

    const alreadyLinked = await this.prisma.leaveType.findMany({
      where: { deletedAt: null, catalogId: { not: null } },
      select: { companyId: true, catalogId: true },
    });

    // catalog แถวไหนถูกจองไปแล้วบ้างในแต่ละบริษัท
    const taken = new Set(
      alreadyLinked.map((type) => `${type.companyId}:${type.catalogId}`),
    );

    let linked = 0;
    let skipped = 0;

    for (const type of unlinked) {
      const referenceCode = LEGACY_LEAVE_CODE_TO_REFERENCE_CODE[type.code];
      const catalog = referenceCode
        ? catalogByReferenceCode.get(referenceCode)
        : undefined;

      if (!catalog) {
        skipped += 1;
        continue;
      }

      const key = `${type.companyId}:${catalog.id}`;
      if (taken.has(key)) {
        skipped += 1;
        continue;
      }

      await this.prisma.leaveType.update({
        where: { id: type.id },
        data: { catalogId: catalog.id, referenceCode: catalog.referenceCode },
      });

      taken.add(key);
      linked += 1;
    }

    return { linked, skipped };
  }

  private toCatalogRow(entry: LeaveTypeCatalogEntry, index: number) {
    return {
      code: entry.code,
      nameTh: entry.nameTh,
      nameEn: entry.nameEn,
      description: entry.description,
      sortOrder: (index + 1) * 10,
      isSystem: true,

      isPaid: entry.isPaid,
      requiresAttachment: entry.requiresAttachment,
      allowHalfDay: entry.allowPartialDay === true,
      allowHourly: entry.allowPartialDay === true,

      deductQuota: true,
      affectAttendance: true,
      affectPayroll: !entry.isPaid || entry.includeInSocialSecurity,

      minLeaveUnitMinutes: entry.allowPartialDay === true ? 30 : 240,
      maxLeaveDaysPerRequest: entry.maxConsecutiveDays,

      advanceNoticeDays: entry.advanceNoticeDays,
      allowBackdated: entry.maxBackdatedDays > 0,
      maxBackdatedDays: entry.maxBackdatedDays,
      backdatedRequiresAttachment: entry.maxBackdatedDays > 0,
      backdatedRequiresHrApproval: true,

      allowNegativeBalance: !entry.enforceQuotaLimit,
      negativeBalanceMode: entry.enforceQuotaLimit
        ? 'BLOCK'
        : 'ALLOW_WITH_WARNING',
      enforceQuotaLimit: entry.enforceQuotaLimit,

      /*
       * ตั้งให้ตรงกับพฤติกรรมเดิมของระบบ (นับวันหยุดที่คร่อมช่วงลาเป็นวันลา)
       * ให้ HR ไปปิดเองที่หน้าตั้งค่าเมื่อพร้อม จะได้ไม่มีบริษัทไหนตัวเลขเปลี่ยนเอง
       */
      includeHoliday: true,
      includeWeekend: true,

      attachmentRequiredAfterDays: null,

      quotaAccrualYears: entry.quotaAccrualYears,
      genderEligibility: entry.genderEligibility,
      serviceStartBasis: entry.serviceStartBasis,
      requireProbationPassed: entry.requireProbationPassed ?? false,
      prorateFirstYear: entry.prorateFirstYear,
      roundingMode: entry.roundingMode,
      quotaDisplayUnit: entry.quotaDisplayUnit,

      defaultMaxConsecutiveDays: entry.maxConsecutiveDays,
      defaultAnnualQuotaDays: entry.defaultAnnualQuotaDays,
      defaultUnpaidDeductionMultiplier: entry.unpaidDeductionMultiplier,
      defaultIncludeInTax: entry.includeInTax,
      defaultIncludeInSocialSecurity: entry.includeInSocialSecurity,
      defaultAllowCarryForward: entry.allowCarryForward,

      status: entry.enabled ? ('ACTIVE' as const) : ('INACTIVE' as const),
      deletedAt: null,
    };
  }
}
