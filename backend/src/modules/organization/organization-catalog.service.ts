import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  assertCompanyLevelWrite,
  assertWithinScope,
  requireCompanyId,
} from '../../common/tenant/tenant-scope.util';
import { POSITION_CATEGORIES } from './constants/position-catalog.constant';
import {
  BulkToggleOrganizationCatalogDto,
  ListOrganizationCatalogQueryDto,
} from './dto/organization-catalog.dto';

/**
 * OrganizationCatalogService
 * -----------------------------------------------------------------------------
 * แผนก / ฝ่าย / ตำแหน่ง / ประเภทพนักงาน เป็น master ระดับระบบ ใช้ร่วมกันทุกบริษัท
 * บริษัทไหนจะใช้รายการไหนก็กด "เปิดใช้" ระบบจะคัดลอกเป็นแถวของบริษัทนั้น
 *
 * ระดับของข้อมูล
 *   *_catalog                       -> ระบบ  : ชื่อ/รหัสอ้างอิง/ค่าตั้งต้น
 *   Department / Division /
 *   Position / EmployeeType         -> บริษัท: สำเนาที่แก้ต่อได้เอง
 *
 * ทำไมต้อง "คัดลอก" ไม่ใช่ชี้ไปที่ catalog ตรง ๆ
 *   เพราะพนักงาน สายอนุมัติ นโยบายลา/OT ผูกกับแถวระดับบริษัท
 *   และบริษัทต้องแก้ชื่อ/ระดับ/ลำดับของตัวเองได้โดยไม่กระทบบริษัทอื่น
 *
 * ข้อต่างของฝ่าย: อยู่ลอยไม่ได้ ต้องมีแผนกแม่เสมอ การเปิดใช้ฝ่ายจึงเปิดแผนกแม่ให้ด้วย
 */
@Injectable()
export class OrganizationCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ */
  /* positions                                                           */
  /* ------------------------------------------------------------------ */

  /** ตำแหน่งมาตรฐานทั้งหมด พร้อมสถานะว่าบริษัทนี้เปิดใช้แล้วหรือยัง */
  async listPositionCatalog(
    query: ListOrganizationCatalogQueryDto,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, query.companyId);
    assertWithinScope(scope, { companyId });

    const where: Prisma.PositionCatalogWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
    };

    if (query.category?.trim()) {
      where.category = query.category.trim();
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [catalogItems, companyRows] = await Promise.all([
      this.prisma.positionCatalog.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { referenceCode: 'asc' }],
      }),
      this.prisma.position.findMany({
        where: { companyId, deletedAt: null },
        include: { _count: { select: { employees: true } } },
      }),
    ]);

    const byCatalogId = new Map(
      companyRows
        .filter((row) => row.catalogId)
        .map((row) => [row.catalogId as string, row]),
    );

    const items = catalogItems.map((item) => {
      const companyRow = byCatalogId.get(item.id) ?? null;

      return {
        ...item,
        categoryLabel:
          POSITION_CATEGORIES[
            item.category as keyof typeof POSITION_CATEGORIES
          ] ?? item.category,
        enabled: Boolean(companyRow && companyRow.status === 'ACTIVE'),
        companyItem: companyRow,
        employeeCount: companyRow?._count.employees ?? 0,
      };
    });

    // ตำแหน่งที่บริษัทสร้างเอง (ไม่ได้มาจาก catalog) แสดงแยกไว้ให้เห็นว่ามีอะไรบ้าง
    const customItems = companyRows.filter((row) => !row.catalogId);

    return {
      companyId,
      items:
        query.enabledOnly === 'true' ? items.filter((i) => i.enabled) : items,
      customItems,
      categories: Object.entries(POSITION_CATEGORIES).map(([key, label]) => ({
        key,
        label,
        total: catalogItems.filter((item) => item.category === key).length,
      })),
      summary: {
        total: catalogItems.length,
        enabled: items.filter((item) => item.enabled).length,
        custom: customItems.length,
      },
    };
  }

  /**
   * เปิดใช้ตำแหน่งให้บริษัท — เรียกซ้ำได้
   * ถ้าเคยเปิดแล้วปิดไป จะกลับมา ACTIVE โดยไม่ทับชื่อ/ระดับที่บริษัทแก้ไว้
   */
  async enablePosition(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ตำแหน่ง',
    );

    const catalog = await this.prisma.positionCatalog.findFirst({
      where: { id: catalogId, deletedAt: null },
    });

    if (!catalog) {
      throw new NotFoundException('ไม่พบตำแหน่งในรายการมาตรฐาน');
    }

    await this.assertCompanyUsable(companyId);

    return this.prisma.$transaction(async (tx) => {
      /*
       * ไม่กรอง deletedAt ตรงนี้โดยตั้งใจ
       *
       * ถ้าบริษัทเคยกด "ปิดใช้งาน" ที่ตารางตำแหน่ง (soft delete) แถวเดิมยังจอง
       * code อยู่ตาม unique [companyId, code] ถ้ามองข้ามไปแล้วสร้างใหม่
       * จะได้รหัสเพี้ยนเป็น XXX-2 ทั้งที่ควรแค่เอาของเดิมกลับมา
       */
      const existing = await tx.position.findFirst({
        where: { companyId, catalogId: catalog.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (existing) {
        return tx.position.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', deletedAt: null },
        });
      }

      const code = await this.resolveAvailablePositionCode(
        tx,
        companyId,
        catalog.code,
      );

      /*
       * ลำดับในผังองค์กรใช้ของ catalog ตรง ๆ ไม่ได้ เพราะบริษัทอาจมีตำแหน่งเดิม
       * ที่ใช้เลขชนกันอยู่ — ต่อท้ายจากลำดับสูงสุดที่บริษัทมีแทน แล้ว HR ปรับเองได้
       */
      const highest = await tx.position.aggregate({
        where: { companyId, deletedAt: null },
        _max: { sortOrder: true },
      });

      return tx.position.create({
        data: {
          companyId,
          catalogId: catalog.id,
          referenceCode: catalog.referenceCode,
          code,
          nameTh: catalog.nameTh,
          nameEn: catalog.nameEn,
          description: catalog.description,
          level: catalog.level,
          sortOrder: (highest._max.sortOrder ?? 0) + 1,
          status: 'ACTIVE',
        },
      });
    });
  }

  /** ปิดใช้ตำแหน่งของบริษัท — เก็บข้อมูลไว้ทั้งหมด แค่ไม่ให้เลือกใช้ต่อ */
  async disablePosition(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ตำแหน่ง',
    );

    const position = await this.prisma.position.findFirst({
      where: { companyId, catalogId, deletedAt: null },
      select: { id: true, nameTh: true },
    });

    if (!position) {
      throw new NotFoundException('บริษัทนี้ยังไม่ได้เปิดใช้ตำแหน่งนี้');
    }

    const inUse = await this.prisma.employee.count({
      where: { positionId: position.id, deletedAt: null },
    });

    if (inUse > 0) {
      throw new BadRequestException(
        `ยังมีพนักงานใช้ตำแหน่ง "${position.nameTh}" อยู่ ${inUse.toLocaleString('th-TH')} คน กรุณาย้ายตำแหน่งให้เรียบร้อยก่อน`,
      );
    }

    return this.prisma.position.update({
      where: { id: position.id },
      data: { status: 'INACTIVE' },
    });
  }

  /* ------------------------------------------------------------------ */
  /* employee types                                                      */
  /* ------------------------------------------------------------------ */

  async listEmployeeTypeCatalog(
    query: ListOrganizationCatalogQueryDto,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, query.companyId);
    assertWithinScope(scope, { companyId });

    const where: Prisma.EmployeeTypeCatalogWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [catalogItems, companyRows] = await Promise.all([
      this.prisma.employeeTypeCatalog.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { referenceCode: 'asc' }],
      }),
      this.prisma.employeeType.findMany({
        where: { companyId, deletedAt: null },
        include: { _count: { select: { employees: true } } },
      }),
    ]);

    const byCatalogId = new Map(
      companyRows
        .filter((row) => row.catalogId)
        .map((row) => [row.catalogId as string, row]),
    );

    const items = catalogItems.map((item) => {
      const companyRow = byCatalogId.get(item.id) ?? null;

      return {
        ...item,
        enabled: Boolean(companyRow && companyRow.status === 'ACTIVE'),
        companyItem: companyRow,
        employeeCount: companyRow?._count.employees ?? 0,
      };
    });

    const customItems = companyRows.filter((row) => !row.catalogId);

    return {
      companyId,
      items:
        query.enabledOnly === 'true' ? items.filter((i) => i.enabled) : items,
      customItems,
      categories: [],
      summary: {
        total: catalogItems.length,
        enabled: items.filter((item) => item.enabled).length,
        custom: customItems.length,
      },
    };
  }

  async enableEmployeeType(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ประเภทพนักงาน',
    );

    const catalog = await this.prisma.employeeTypeCatalog.findFirst({
      where: { id: catalogId, deletedAt: null },
    });

    if (!catalog) {
      throw new NotFoundException('ไม่พบประเภทพนักงานในรายการมาตรฐาน');
    }

    await this.assertCompanyUsable(companyId);

    return this.prisma.$transaction(async (tx) => {
      // เหตุผลเดียวกับ enablePosition — เอาแถวเดิมที่ปิดไปแล้วกลับมา ไม่สร้างซ้ำ
      const existing = await tx.employeeType.findFirst({
        where: { companyId, catalogId: catalog.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (existing) {
        return tx.employeeType.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', deletedAt: null },
        });
      }

      const code = await this.resolveAvailableEmployeeTypeCode(
        tx,
        companyId,
        catalog.code,
      );

      return tx.employeeType.create({
        data: {
          companyId,
          catalogId: catalog.id,
          referenceCode: catalog.referenceCode,
          code,
          nameTh: catalog.nameTh,
          nameEn: catalog.nameEn,
          description: catalog.description,
          status: 'ACTIVE',
        },
      });
    });
  }

  async disableEmployeeType(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ประเภทพนักงาน',
    );

    const employeeType = await this.prisma.employeeType.findFirst({
      where: { companyId, catalogId, deletedAt: null },
      select: { id: true, nameTh: true },
    });

    if (!employeeType) {
      throw new NotFoundException('บริษัทนี้ยังไม่ได้เปิดใช้ประเภทพนักงานนี้');
    }

    const inUse = await this.prisma.employee.count({
      where: { employeeTypeId: employeeType.id, deletedAt: null },
    });

    if (inUse > 0) {
      throw new BadRequestException(
        `ยังมีพนักงานอยู่ในประเภท "${employeeType.nameTh}" ${inUse.toLocaleString('th-TH')} คน กรุณาย้ายประเภทให้เรียบร้อยก่อน`,
      );
    }

    return this.prisma.employeeType.update({
      where: { id: employeeType.id },
      data: { status: 'INACTIVE' },
    });
  }

  /* ------------------------------------------------------------------ */
  /* departments                                                         */
  /* ------------------------------------------------------------------ */

  async listDepartmentCatalog(
    query: ListOrganizationCatalogQueryDto,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, query.companyId);
    assertWithinScope(scope, { companyId });

    const where: Prisma.DepartmentCatalogWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
    };

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [catalogItems, companyRows] = await Promise.all([
      this.prisma.departmentCatalog.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { referenceCode: 'asc' }],
      }),
      this.prisma.department.findMany({
        where: { companyId, deletedAt: null },
        include: { _count: { select: { employees: true } } },
      }),
    ]);

    const byCatalogId = new Map(
      companyRows
        .filter((row) => row.catalogId)
        .map((row) => [row.catalogId as string, row]),
    );

    const items = catalogItems.map((item) => {
      const companyRow = byCatalogId.get(item.id) ?? null;

      return {
        ...item,
        enabled: Boolean(companyRow && companyRow.status === 'ACTIVE'),
        companyItem: companyRow,
        employeeCount: companyRow?._count.employees ?? 0,
      };
    });

    const customItems = companyRows.filter((row) => !row.catalogId);

    return {
      companyId,
      items:
        query.enabledOnly === 'true' ? items.filter((i) => i.enabled) : items,
      customItems,
      categories: [],
      summary: {
        total: catalogItems.length,
        enabled: items.filter((item) => item.enabled).length,
        custom: customItems.length,
      },
    };
  }

  async enableDepartment(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'แผนก',
    );

    const catalog = await this.prisma.departmentCatalog.findFirst({
      where: { id: catalogId, deletedAt: null },
    });

    if (!catalog) {
      throw new NotFoundException('ไม่พบแผนกในรายการมาตรฐาน');
    }

    await this.assertCompanyUsable(companyId);

    return this.prisma.$transaction((tx) =>
      this.ensureCompanyDepartment(tx, companyId, catalog),
    );
  }

  async disableDepartment(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'แผนก',
    );

    const department = await this.prisma.department.findFirst({
      where: { companyId, catalogId, deletedAt: null },
      select: { id: true, nameTh: true },
    });

    if (!department) {
      throw new NotFoundException('บริษัทนี้ยังไม่ได้เปิดใช้แผนกนี้');
    }

    const [inUse, activeDivisions] = await Promise.all([
      this.prisma.employee.count({
        where: { departmentId: department.id, deletedAt: null },
      }),
      this.prisma.division.count({
        where: {
          departmentId: department.id,
          deletedAt: null,
          status: 'ACTIVE',
        },
      }),
    ]);

    if (inUse > 0) {
      throw new BadRequestException(
        `ยังมีพนักงานสังกัดแผนก "${department.nameTh}" อยู่ ${inUse.toLocaleString('th-TH')} คน กรุณาย้ายแผนกให้เรียบร้อยก่อน`,
      );
    }

    /*
     * กันฝ่ายลอย — ฝ่ายที่ยังเปิดอยู่ใต้แผนกที่ถูกปิด จะโผล่ในตัวเลือกแต่เลือกแล้ว
     * บันทึกไม่ได้ เพราะ backend ตรวจว่าแผนกแม่ต้อง ACTIVE
     */
    if (activeDivisions > 0) {
      throw new BadRequestException(
        `แผนก "${department.nameTh}" ยังมีฝ่าย/กลุ่มงานเปิดใช้อยู่ ${activeDivisions.toLocaleString('th-TH')} รายการ กรุณาปิดฝ่ายก่อน`,
      );
    }

    return this.prisma.department.update({
      where: { id: department.id },
      data: { status: 'INACTIVE' },
    });
  }

  /* ------------------------------------------------------------------ */
  /* divisions                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * ฝ่ายมาตรฐาน จัดกลุ่มตามแผนกแม่
   *
   * `category` ใช้ referenceCode ของแผนกแม่ เพื่อให้หน้าจอจัดกลุ่มด้วยกลไกเดียว
   * กับที่ตำแหน่งใช้จัดกลุ่มตามสายงาน ไม่ต้องมีโค้ดแยกอีกชุด
   */
  async listDivisionCatalog(
    query: ListOrganizationCatalogQueryDto,
    scope: TenantScope,
  ) {
    const companyId = requireCompanyId(scope, query.companyId);
    assertWithinScope(scope, { companyId });

    const where: Prisma.DivisionCatalogWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
    };

    if (query.category?.trim()) {
      where.departmentCatalog = {
        is: { referenceCode: query.category.trim() },
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { nameTh: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [catalogItems, companyRows] = await Promise.all([
      this.prisma.divisionCatalog.findMany({
        where,
        include: {
          departmentCatalog: {
            select: { referenceCode: true, nameTh: true, sortOrder: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { referenceCode: 'asc' }],
      }),
      this.prisma.division.findMany({
        where: {
          department: { is: { companyId, deletedAt: null } },
          deletedAt: null,
        },
        include: {
          _count: { select: { employees: true } },
          department: { select: { id: true, nameTh: true } },
        },
      }),
    ]);

    const byCatalogId = new Map(
      companyRows
        .filter((row) => row.catalogId)
        .map((row) => [row.catalogId as string, row]),
    );

    const items = catalogItems.map((item) => {
      const companyRow = byCatalogId.get(item.id) ?? null;

      return {
        ...item,
        category: item.departmentCatalog.referenceCode,
        categoryLabel: item.departmentCatalog.nameTh,
        enabled: Boolean(companyRow && companyRow.status === 'ACTIVE'),
        companyItem: companyRow,
        employeeCount: companyRow?._count.employees ?? 0,
      };
    });

    const customItems = companyRows.filter((row) => !row.catalogId);

    // หมวดคือแผนกแม่ นับเฉพาะที่มีฝ่ายอยู่จริง เรียงตามลำดับแผนก
    const categoryMap = new Map<
      string,
      { key: string; label: string; total: number; sortOrder: number }
    >();

    for (const item of catalogItems) {
      const key = item.departmentCatalog.referenceCode;
      const found = categoryMap.get(key);

      if (found) {
        found.total += 1;
      } else {
        categoryMap.set(key, {
          key,
          label: item.departmentCatalog.nameTh,
          total: 1,
          sortOrder: item.departmentCatalog.sortOrder,
        });
      }
    }

    return {
      companyId,
      items:
        query.enabledOnly === 'true' ? items.filter((i) => i.enabled) : items,
      customItems,
      categories: [...categoryMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ key, label, total }) => ({ key, label, total })),
      summary: {
        total: catalogItems.length,
        enabled: items.filter((item) => item.enabled).length,
        custom: customItems.length,
      },
    };
  }

  /**
   * เปิดใช้ฝ่ายให้บริษัท
   *
   * ฝ่ายอยู่ลอยไม่ได้ ถ้าบริษัทยังไม่ได้เปิดแผนกแม่ ระบบเปิดให้อัตโนมัติ
   * (ทางเลือกอื่นคือโยน error แล้วให้ผู้ใช้ไปกดเองอีกหน้า ซึ่งไม่มีอะไรบอกว่า
   * ต้องไปกดอะไรก่อน — เปิดให้เลยตรงไปตรงมากว่า)
   */
  async enableDivision(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ฝ่าย/กลุ่มงาน',
    );

    const catalog = await this.prisma.divisionCatalog.findFirst({
      where: { id: catalogId, deletedAt: null },
      include: { departmentCatalog: true },
    });

    if (!catalog) {
      throw new NotFoundException('ไม่พบฝ่าย/กลุ่มงานในรายการมาตรฐาน');
    }

    await this.assertCompanyUsable(companyId);

    return this.prisma.$transaction(async (tx) => {
      const department = await this.ensureCompanyDepartment(
        tx,
        companyId,
        catalog.departmentCatalog,
      );

      // เหตุผลเดียวกับ enablePosition — เอาแถวเดิมที่ปิดไปแล้วกลับมา ไม่สร้างซ้ำ
      const existing = await tx.division.findFirst({
        where: { departmentId: department.id, catalogId: catalog.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (existing) {
        return tx.division.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', deletedAt: null },
        });
      }

      const code = await resolveAvailableCode(catalog.code, async (value) => {
        const found = await tx.division.findFirst({
          where: { departmentId: department.id, code: value },
          select: { id: true },
        });
        return Boolean(found);
      });

      return tx.division.create({
        data: {
          departmentId: department.id,
          catalogId: catalog.id,
          referenceCode: catalog.referenceCode,
          code,
          nameTh: catalog.nameTh,
          nameEn: catalog.nameEn,
          status: 'ACTIVE',
        },
      });
    });
  }

  async disableDivision(
    catalogId: string,
    requestedCompanyId: string | undefined,
    scope: TenantScope,
  ) {
    const companyId = this.assertManageableCompany(
      requestedCompanyId,
      scope,
      'ฝ่าย/กลุ่มงาน',
    );

    const division = await this.prisma.division.findFirst({
      where: {
        catalogId,
        deletedAt: null,
        department: { is: { companyId, deletedAt: null } },
      },
      select: { id: true, nameTh: true },
    });

    if (!division) {
      throw new NotFoundException('บริษัทนี้ยังไม่ได้เปิดใช้ฝ่าย/กลุ่มงานนี้');
    }

    const inUse = await this.prisma.employee.count({
      where: { divisionId: division.id, deletedAt: null },
    });

    if (inUse > 0) {
      throw new BadRequestException(
        `ยังมีพนักงานสังกัดฝ่าย "${division.nameTh}" อยู่ ${inUse.toLocaleString('th-TH')} คน กรุณาย้ายฝ่ายให้เรียบร้อยก่อน`,
      );
    }

    return this.prisma.division.update({
      where: { id: division.id },
      data: { status: 'INACTIVE' },
    });
  }

  /**
   * หา (หรือสร้าง) แผนกของบริษัทที่ผูกกับ catalog ที่ระบุ
   *
   * ใช้ร่วมกันระหว่างการเปิดแผนกตรง ๆ กับการเปิดฝ่ายที่ต้องมีแผนกแม่ก่อน
   * แผนกที่สร้างจาก catalog เป็นระดับบริษัท (branchId = null) จึงใช้ได้ทุกสาขา
   */
  private async ensureCompanyDepartment(
    tx: Prisma.TransactionClient,
    companyId: string,
    catalog: {
      id: string;
      referenceCode: string;
      code: string;
      nameTh: string;
      nameEn: string | null;
    },
  ) {
    const existing = await tx.department.findFirst({
      where: { companyId, catalogId: catalog.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (existing) {
      return tx.department.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', deletedAt: null },
      });
    }

    const code = await resolveAvailableCode(catalog.code, async (value) => {
      const found = await tx.department.findFirst({
        where: { companyId, code: value },
        select: { id: true },
      });
      return Boolean(found);
    });

    return tx.department.create({
      data: {
        companyId,
        branchId: null,
        catalogId: catalog.id,
        referenceCode: catalog.referenceCode,
        code,
        nameTh: catalog.nameTh,
        nameEn: catalog.nameEn,
        status: 'ACTIVE',
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* bulk                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * เปิดใช้หลายรายการรวดเดียว
   *
   * ทำทีละใบแล้วรวมผล ไม่ห่อเป็นทรานแซกชันเดียว เพราะถ้ารายการหนึ่งพัง
   * (เช่นรหัสชนแบบที่แก้ไม่ได้) ไม่ควรทำให้ที่เปิดสำเร็จไปแล้วถูกย้อนทั้งชุด
   */
  async enablePositionsBulk(
    dto: BulkToggleOrganizationCatalogDto,
    scope: TenantScope,
  ) {
    return this.runBulk(dto.catalogIds, (catalogId) =>
      this.enablePosition(catalogId, dto.companyId, scope),
    );
  }

  async enableEmployeeTypesBulk(
    dto: BulkToggleOrganizationCatalogDto,
    scope: TenantScope,
  ) {
    return this.runBulk(dto.catalogIds, (catalogId) =>
      this.enableEmployeeType(catalogId, dto.companyId, scope),
    );
  }

  async enableDepartmentsBulk(
    dto: BulkToggleOrganizationCatalogDto,
    scope: TenantScope,
  ) {
    return this.runBulk(dto.catalogIds, (catalogId) =>
      this.enableDepartment(catalogId, dto.companyId, scope),
    );
  }

  async enableDivisionsBulk(
    dto: BulkToggleOrganizationCatalogDto,
    scope: TenantScope,
  ) {
    return this.runBulk(dto.catalogIds, (catalogId) =>
      this.enableDivision(catalogId, dto.companyId, scope),
    );
  }

  private async runBulk(
    catalogIds: string[],
    run: (catalogId: string) => Promise<unknown>,
  ) {
    const failed: Array<{ catalogId: string; message: string }> = [];
    let enabled = 0;

    // ไล่ทีละใบตามลำดับ เพื่อให้ resolveAvailableCode เห็นรหัสที่เพิ่งสร้างไปแล้ว
    for (const catalogId of [...new Set(catalogIds)]) {
      try {
        await run(catalogId);
        enabled += 1;
      } catch (error) {
        failed.push({
          catalogId,
          message:
            error instanceof Error ? error.message : 'เปิดใช้งานไม่สำเร็จ',
        });
      }
    }

    return { enabled, failed, total: new Set(catalogIds).size };
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private assertManageableCompany(
    requestedCompanyId: string | undefined,
    scope: TenantScope,
    subject: string,
  ) {
    const companyId = requireCompanyId(scope, requestedCompanyId);
    assertWithinScope(scope, { companyId });
    // เปิด/ปิดรายการมาตรฐาน มีผลทั้งบริษัท บัญชีระดับสาขาจึงสั่งไม่ได้
    assertCompanyLevelWrite(scope, subject);

    return companyId;
  }

  private async assertCompanyUsable(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('ไม่พบบริษัท หรือบริษัทไม่พร้อมใช้งาน');
    }
  }

  /**
   * หา code ที่ยังว่างในบริษัทนี้
   *
   * รหัสจาก catalog อาจชนกับรายการเดิมที่บริษัทสร้างเองไว้ก่อน (unique [companyId, code])
   * กรณีนั้นเติมเลขต่อท้ายให้ แล้ว HR ไปแก้เองทีหลังได้
   */
  private async resolveAvailablePositionCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    preferredCode: string,
  ) {
    return resolveAvailableCode(preferredCode, async (code) => {
      const found = await tx.position.findFirst({
        where: { companyId, code },
        select: { id: true },
      });
      return Boolean(found);
    });
  }

  private async resolveAvailableEmployeeTypeCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    preferredCode: string,
  ) {
    return resolveAvailableCode(preferredCode, async (code) => {
      const found = await tx.employeeType.findFirst({
        where: { companyId, code },
        select: { id: true },
      });
      return Boolean(found);
    });
  }
}

/**
 * เติมเลขต่อท้ายจนกว่าจะได้รหัสที่ยังไม่ถูกใช้
 *
 * ตัดที่ 50 รอบ ไม่ใช่เพราะคาดว่าจะชนขนาดนั้น แต่กันลูปไม่รู้จบถ้า callback
 * ตอบผิดพลาด — ถึงตรงนั้นบอกให้ตั้งรหัสเองดีกว่าค้าง
 */
async function resolveAvailableCode(
  preferredCode: string,
  isTaken: (code: string) => Promise<boolean>,
) {
  const base = preferredCode.trim().toUpperCase() || 'ITEM';

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new BadRequestException(
    `รหัส "${base}" ถูกใช้ไปหมดแล้ว กรุณาสร้างรายการนี้เองพร้อมตั้งรหัสใหม่`,
  );
}
