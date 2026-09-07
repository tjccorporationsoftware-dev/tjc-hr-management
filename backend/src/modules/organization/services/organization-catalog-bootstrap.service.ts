import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  DEPARTMENT_CATALOG,
  LEGACY_DEPARTMENT_CODE_TO_REFERENCE_CODE,
} from '../constants/department-catalog.constant';
import {
  DIVISION_CATALOG,
  LEGACY_DIVISION_CODE_TO_REFERENCE_CODE,
} from '../constants/division-catalog.constant';
import {
  EMPLOYEE_TYPE_CATALOG,
  LEGACY_EMPLOYEE_TYPE_CODE_TO_REFERENCE_CODE,
} from '../constants/employee-type-catalog.constant';
import {
  LEGACY_POSITION_CODE_TO_REFERENCE_CODE,
  POSITION_CATALOG,
} from '../constants/position-catalog.constant';

/**
 * OrganizationCatalogBootstrapService
 * -----------------------------------------------------------------------------
 * ทำให้รายการมาตรฐานของโครงสร้างองค์กร (แผนก / ฝ่าย / ตำแหน่ง / ประเภทพนักงาน)
 * เป็นค่าคงที่ของระบบจริง ๆ ไม่ใช่ข้อมูล seed ที่หายไปเมื่อล้างฐานข้อมูล
 *
 * แหล่งความจริงคือไฟล์ใน `constants/` ส่วนตาราง `*_catalog` เป็นสำเนาที่ต้องมี
 * เพราะ `catalogId` ของแถวระดับบริษัทเป็น foreign key ชี้มาที่ตารางนี้
 *
 * แพตเทิร์นเดียวกับ LeaveTypeCatalogBootstrapService ทุกประการ
 *
 * ไม่แตะข้อมูลของบริษัท — แถวที่บริษัทตั้งไว้เองไม่ถูกเขียนทับ
 * มีแค่การเติม `catalogId`/`referenceCode` ให้แถวเดิมที่จับคู่รหัสได้เท่านั้น
 */
@Injectable()
export class OrganizationCatalogBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(
    OrganizationCatalogBootstrapService.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    /*
     * ไม่ให้การซิงก์ล้มแล้วแอปบูตไม่ขึ้น
     * ถ้าฐานข้อมูลยังไม่พร้อม (migrate ยังไม่ผ่าน / DB ยังไม่ขึ้น) ให้เขียน log
     * แล้วปล่อยผ่าน รอบบูตถัดไปจะซิงก์ใหม่เอง
     */
    try {
      // แผนกต้องซิงก์ก่อนฝ่าย เพราะ division_catalog มี FK ชี้ไปที่ department_catalog
      const departments = await this.syncDepartmentCatalog();
      const divisions = await this.syncDivisionCatalog();
      const positions = await this.syncPositionCatalog();
      const types = await this.syncEmployeeTypeCatalog();
      const linked = await this.linkExistingCompanyRows();

      const linkedTotal =
        linked.departments +
        linked.divisions +
        linked.positions +
        linked.employeeTypes;

      this.logger.log(
        `รายการมาตรฐานพร้อมใช้งาน — แผนก ${departments.total} · ฝ่าย ${divisions.total} · ` +
          `ตำแหน่ง ${positions.total} · ประเภทพนักงาน ${types.total}` +
          (linkedTotal > 0
            ? ` (ผูกของเดิม แผนก ${linked.departments} · ฝ่าย ${linked.divisions} · ` +
              `ตำแหน่ง ${linked.positions} · ประเภทพนักงาน ${linked.employeeTypes})`
            : ''),
      );
    } catch (error) {
      this.logger.error(
        'ซิงก์รายการมาตรฐานโครงสร้างองค์กรไม่สำเร็จ — จะลองใหม่ตอนบูตครั้งถัดไป',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * แผนกมาตรฐาน — ซิงก์ก่อนฝ่ายเสมอ
   */
  private async syncDepartmentCatalog() {
    for (const [index, entry] of DEPARTMENT_CATALOG.entries()) {
      const data = {
        code: entry.code,
        nameTh: entry.nameTh,
        nameEn: entry.nameEn,
        description: entry.description,
        sortOrder: (index + 1) * 10,
        isSystem: true,
        isDefault: entry.isDefault,
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      await this.prisma.departmentCatalog.upsert({
        where: { referenceCode: entry.referenceCode },
        update: data,
        create: { referenceCode: entry.referenceCode, ...data },
      });
    }

    await this.prisma.departmentCatalog.updateMany({
      where: {
        referenceCode: {
          notIn: DEPARTMENT_CATALOG.map((entry) => entry.referenceCode),
        },
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE' },
    });

    return { total: DEPARTMENT_CATALOG.length };
  }

  /**
   * ฝ่าย/กลุ่มงานมาตรฐาน
   *
   * ต้องแปลง `departmentReferenceCode` ในไฟล์ค่าคงที่เป็น id จริงก่อน
   * รายการที่ชี้ไปแผนกที่ไม่มีอยู่ให้ข้าม ไม่ใช่ทำให้การซิงก์ทั้งชุดล้ม
   */
  private async syncDivisionCatalog() {
    const departments = await this.prisma.departmentCatalog.findMany({
      select: { id: true, referenceCode: true },
    });

    const departmentIdByReferenceCode = new Map(
      departments.map((row) => [row.referenceCode, row.id]),
    );

    let synced = 0;

    for (const [index, entry] of DIVISION_CATALOG.entries()) {
      const departmentCatalogId = departmentIdByReferenceCode.get(
        entry.departmentReferenceCode,
      );

      if (!departmentCatalogId) {
        this.logger.warn(
          `ข้ามฝ่ายมาตรฐาน ${entry.referenceCode} (${entry.nameTh}) ` +
            `เพราะไม่พบแผนกแม่ ${entry.departmentReferenceCode}`,
        );
        continue;
      }

      const data = {
        departmentCatalogId,
        code: entry.code,
        nameTh: entry.nameTh,
        nameEn: entry.nameEn,
        description: entry.description,
        sortOrder: (index + 1) * 10,
        isSystem: true,
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      await this.prisma.divisionCatalog.upsert({
        where: { referenceCode: entry.referenceCode },
        update: data,
        create: { referenceCode: entry.referenceCode, ...data },
      });

      synced += 1;
    }

    await this.prisma.divisionCatalog.updateMany({
      where: {
        referenceCode: {
          notIn: DIVISION_CATALOG.map((entry) => entry.referenceCode),
        },
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE' },
    });

    return { total: synced };
  }

  /* ------------------------------------------------------------------ */
  /* sync                                                                */
  /* ------------------------------------------------------------------ */

  /** เขียนค่าคงที่ลงตาราง — รันซ้ำได้ (upsert ด้วย referenceCode) */
  private async syncPositionCatalog() {
    for (const [index, entry] of POSITION_CATALOG.entries()) {
      const data = {
        code: entry.code,
        nameTh: entry.nameTh,
        nameEn: entry.nameEn,
        description: entry.description,
        level: entry.level,
        sortOrder: (index + 1) * 10,
        category: entry.category,
        isSystem: true,
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      await this.prisma.positionCatalog.upsert({
        where: { referenceCode: entry.referenceCode },
        update: data,
        create: { referenceCode: entry.referenceCode, ...data },
      });
    }

    /*
     * รายการที่ถูกถอดออกจากไฟล์ค่าคงที่ → ปิดใช้ ไม่ลบ
     * ลบไม่ได้เพราะบริษัทที่เปิดใช้ไปแล้วมี FK ชี้อยู่ ปิดแค่ไม่ให้เลือกเพิ่ม
     */
    await this.prisma.positionCatalog.updateMany({
      where: {
        referenceCode: {
          notIn: POSITION_CATALOG.map((entry) => entry.referenceCode),
        },
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE' },
    });

    return { total: POSITION_CATALOG.length };
  }

  private async syncEmployeeTypeCatalog() {
    for (const [index, entry] of EMPLOYEE_TYPE_CATALOG.entries()) {
      const data = {
        code: entry.code,
        nameTh: entry.nameTh,
        nameEn: entry.nameEn,
        description: entry.description,
        sortOrder: (index + 1) * 10,
        isSystem: true,
        isDefault: entry.isDefault,
        status: 'ACTIVE' as const,
        deletedAt: null,
      };

      await this.prisma.employeeTypeCatalog.upsert({
        where: { referenceCode: entry.referenceCode },
        update: data,
        create: { referenceCode: entry.referenceCode, ...data },
      });
    }

    await this.prisma.employeeTypeCatalog.updateMany({
      where: {
        referenceCode: {
          notIn: EMPLOYEE_TYPE_CATALOG.map((entry) => entry.referenceCode),
        },
        status: 'ACTIVE',
      },
      data: { status: 'INACTIVE' },
    });

    return { total: EMPLOYEE_TYPE_CATALOG.length };
  }

  /* ------------------------------------------------------------------ */
  /* link                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * ผูกแถวเดิมของบริษัทเข้ากับรายการมาตรฐาน
   *
   * ปลอดภัยต่อข้อมูลเดิม — เขียนแค่ `catalogId` กับ `referenceCode`
   * ไม่แตะชื่อ ระดับ ลำดับ หรือพนักงานที่ผูกอยู่
   *
   * ข้ามให้เมื่อ
   *  - ผูก catalog ไว้แล้ว
   *  - รหัสไม่มีคู่ในตารางจับคู่ (ถือเป็นรายการที่บริษัทสร้างเอง)
   *  - ขอบเขตนั้นมีแถวอื่นผูกกับ catalog เดียวกันไปแล้ว (กันผูกซ้อน)
   */
  private async linkExistingCompanyRows() {
    const departments = await this.linkDepartments();
    const divisions = await this.linkDivisions();
    const positions = await this.linkPositions();
    const employeeTypes = await this.linkEmployeeTypes();

    return { departments, divisions, positions, employeeTypes };
  }

  private async linkDepartments() {
    const [unlinked, catalogRows, alreadyLinked] = await Promise.all([
      this.prisma.department.findMany({
        where: { deletedAt: null, catalogId: null },
        select: { id: true, companyId: true, code: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.departmentCatalog.findMany({
        where: { deletedAt: null },
        select: { id: true, referenceCode: true },
      }),
      this.prisma.department.findMany({
        where: { deletedAt: null, catalogId: { not: null } },
        select: { companyId: true, catalogId: true },
      }),
    ]);

    const plan = planLinks(
      unlinked.map((row) => ({ ...row, scopeId: row.companyId })),
      catalogRows,
      alreadyLinked.map((row) => ({ ...row, scopeId: row.companyId })),
      LEGACY_DEPARTMENT_CODE_TO_REFERENCE_CODE,
    );

    for (const item of plan) {
      await this.prisma.department.update({
        where: { id: item.id },
        data: {
          catalogId: item.catalogId,
          referenceCode: item.referenceCode,
        },
      });
    }

    return plan.length;
  }

  /**
   * ฝ่ายใช้ "แผนกที่สังกัด" เป็นขอบเขตกันผูกซ้อน ไม่ใช่บริษัท
   * เพราะรหัสฝ่ายไม่ซ้ำต่อแผนก (`@@unique([departmentId, code])`)
   * คนละแผนกในบริษัทเดียวกันจึงมีฝ่ายรหัสเดียวกันได้
   */
  private async linkDivisions() {
    const [unlinked, catalogRows, alreadyLinked] = await Promise.all([
      this.prisma.division.findMany({
        where: { deletedAt: null, catalogId: null },
        select: { id: true, departmentId: true, code: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.divisionCatalog.findMany({
        where: { deletedAt: null },
        select: { id: true, referenceCode: true },
      }),
      this.prisma.division.findMany({
        where: { deletedAt: null, catalogId: { not: null } },
        select: { departmentId: true, catalogId: true },
      }),
    ]);

    const plan = planLinks(
      unlinked.map((row) => ({ ...row, scopeId: row.departmentId })),
      catalogRows,
      alreadyLinked.map((row) => ({ ...row, scopeId: row.departmentId })),
      LEGACY_DIVISION_CODE_TO_REFERENCE_CODE,
    );

    for (const item of plan) {
      await this.prisma.division.update({
        where: { id: item.id },
        data: {
          catalogId: item.catalogId,
          referenceCode: item.referenceCode,
        },
      });
    }

    return plan.length;
  }

  private async linkPositions() {
    const [unlinked, catalogRows, alreadyLinked] = await Promise.all([
      this.prisma.position.findMany({
        where: { deletedAt: null, catalogId: null },
        select: { id: true, companyId: true, code: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.positionCatalog.findMany({
        where: { deletedAt: null },
        select: { id: true, referenceCode: true },
      }),
      this.prisma.position.findMany({
        where: { deletedAt: null, catalogId: { not: null } },
        select: { companyId: true, catalogId: true },
      }),
    ]);

    const plan = planLinks(
      unlinked.map((row) => ({ ...row, scopeId: row.companyId })),
      catalogRows,
      alreadyLinked.map((row) => ({ ...row, scopeId: row.companyId })),
      LEGACY_POSITION_CODE_TO_REFERENCE_CODE,
    );

    for (const item of plan) {
      await this.prisma.position.update({
        where: { id: item.id },
        data: {
          catalogId: item.catalogId,
          referenceCode: item.referenceCode,
        },
      });
    }

    return plan.length;
  }

  private async linkEmployeeTypes() {
    const [unlinked, catalogRows, alreadyLinked] = await Promise.all([
      this.prisma.employeeType.findMany({
        where: { deletedAt: null, catalogId: null },
        select: { id: true, companyId: true, code: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.employeeTypeCatalog.findMany({
        where: { deletedAt: null },
        select: { id: true, referenceCode: true },
      }),
      this.prisma.employeeType.findMany({
        where: { deletedAt: null, catalogId: { not: null } },
        select: { companyId: true, catalogId: true },
      }),
    ]);

    const plan = planLinks(
      unlinked.map((row) => ({ ...row, scopeId: row.companyId })),
      catalogRows,
      alreadyLinked.map((row) => ({ ...row, scopeId: row.companyId })),
      LEGACY_EMPLOYEE_TYPE_CODE_TO_REFERENCE_CODE,
    );

    for (const item of plan) {
      await this.prisma.employeeType.update({
        where: { id: item.id },
        data: {
          catalogId: item.catalogId,
          referenceCode: item.referenceCode,
        },
      });
    }

    return plan.length;
  }
}

/* ------------------------------------------------------------------ */
/* pure logic — แยกออกมาเทสได้ และใช้ร่วมกันได้ทั้งสองตาราง            */
/* ------------------------------------------------------------------ */

/**
 * `scopeId` คือขอบเขตที่ห้ามผูก catalog ซ้ำ — ต่างกันตามตาราง
 *   แผนก / ตำแหน่ง / ประเภทพนักงาน -> companyId   (unique [companyId, code])
 *   ฝ่าย                            -> departmentId (unique [departmentId, code])
 */
type UnlinkedRow = { id: string; scopeId: string; code: string };
type CatalogRow = { id: string; referenceCode: string };
type LinkedRow = { scopeId: string; catalogId: string | null };

/** ตัดสินว่าแถวไหนควรผูกกับ catalog ตัวไหน โดยไม่แตะฐานข้อมูล */
export function planLinks(
  unlinked: UnlinkedRow[],
  catalogRows: CatalogRow[],
  alreadyLinked: LinkedRow[],
  legacyCodeMap: Record<string, string>,
) {
  const catalogByReferenceCode = new Map(
    catalogRows.map((row) => [row.referenceCode, row]),
  );

  // catalog แถวไหนถูกจองไปแล้วบ้างในแต่ละขอบเขต
  const taken = new Set(
    alreadyLinked.map((row) => `${row.scopeId}:${row.catalogId}`),
  );

  const plan: Array<{ id: string; catalogId: string; referenceCode: string }> =
    [];

  for (const row of unlinked) {
    const referenceCode = legacyCodeMap[row.code.trim().toUpperCase()];
    const catalog = referenceCode
      ? catalogByReferenceCode.get(referenceCode)
      : undefined;

    if (!catalog) continue;

    const key = `${row.scopeId}:${catalog.id}`;
    if (taken.has(key)) continue;

    plan.push({
      id: row.id,
      catalogId: catalog.id,
      referenceCode: catalog.referenceCode,
    });
    taken.add(key);
  }

  return plan;
}
