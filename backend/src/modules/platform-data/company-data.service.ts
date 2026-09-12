import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import {
  COMPANY_DATASETS,
  COMPANY_DATASET_MAP,
  COMPANY_DATA_GROUP_LABELS,
  type CompanyDatasetConfig,
} from "./company-data.registry";
import type {
  CompanyDataListQueryDto,
  DeleteCompanyDataDto,
  PurgeCompanyDataDto,
} from "./dto/company-data.dto";

@Injectable()
export class CompanyDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * หน้านี้อ่านและลบข้ามทั้งบริษัทได้ตามรหัสบริษัทที่ส่งมา ไม่ได้ยึด scope ของผู้เรียก
   * จึงต้องเป็นผู้ดูแลระดับทั้งระบบเท่านั้น ไม่งั้นผู้ดูแลระดับบริษัทจะยิง companyId
   * ของบริษัทอื่นเข้ามาแล้วลบข้อมูลข้ามบริษัทได้
   */
  private assertGlobalScope(scope: TenantScope) {
    if (scope.level !== "GLOBAL") {
      throw new ForbiddenException(
        "หน้านี้เปิดให้เฉพาะผู้ดูแลระดับทั้งระบบเท่านั้น",
      );
    }
  }

  private getDataset(key: string): CompanyDatasetConfig {
    const dataset = COMPANY_DATASET_MAP.get(key);

    if (!dataset) {
      throw new NotFoundException(`ไม่รู้จักชุดข้อมูล ${key}`);
    }

    return dataset;
  }

  private delegateOf(dataset: CompanyDatasetConfig) {
    const delegate = (this.prisma as any)[dataset.delegate];

    if (!delegate) {
      throw new BadRequestException(
        `ชุดข้อมูล ${dataset.key} ยังไม่ได้ผูกกับตารางในฐานข้อมูล`,
      );
    }

    return delegate;
  }

  /** เงื่อนไขจำกัดให้เห็นเฉพาะข้อมูลของบริษัทที่เลือก */
  private tenantWhere(dataset: CompanyDatasetConfig, companyId: string) {
    if (dataset.tenant === "direct") {
      return { companyId };
    }

    if (dataset.tenant === "employee") {
      return { employee: { is: { companyId } } };
    }

    /*
     * ผู้ใช้ผูกกับบริษัทได้สองทาง: ตั้ง scope ไว้ที่บริษัทนั้น หรือเป็นผู้ใช้ของ
     * พนักงานในบริษัทนั้น ต้องเอาทั้งสองทาง ไม่งั้นผู้ใช้ระดับสาขาจะหายไปจากรายการ
     */
    return {
      OR: [
        { scopedCompanyId: companyId },
        { employee: { is: { companyId } } },
      ],
    };
  }

  private notDeletedWhere(dataset: CompanyDatasetConfig) {
    return dataset.softDelete ? { deletedAt: null } : {};
  }

  private async assertCompanyExists(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, code: true, nameTh: true, nameEn: true },
    });

    if (!company) {
      throw new NotFoundException("ไม่พบบริษัทที่เลือก");
    }

    return company;
  }

  /** รายชื่อชุดข้อมูลที่หน้านี้รองรับ */
  getDatasets(scope: TenantScope) {
    this.assertGlobalScope(scope);

    return {
      groups: Object.entries(COMPANY_DATA_GROUP_LABELS).map(([key, label]) => ({
        key,
        label,
      })),
      datasets: COMPANY_DATASETS.map((item) => ({
        key: item.key,
        label: item.label,
        group: item.group,
        dateLabel: item.dateLabel,
        softDelete: item.softDelete,
        deletable: item.deletable,
        note: item.note ?? null,
      })),
    };
  }

  /** นับจำนวนข้อมูลแต่ละชุดของบริษัทนั้น */
  async getSummary(companyId: string, scope: TenantScope) {
    this.assertGlobalScope(scope);

    const company = await this.assertCompanyExists(companyId);

    const counts = await Promise.all(
      COMPANY_DATASETS.map(async (dataset) => {
        try {
          const total = await this.delegateOf(dataset).count({
            where: {
              ...this.tenantWhere(dataset, companyId),
              ...this.notDeletedWhere(dataset),
            },
          });

          return { key: dataset.key, total, error: null as string | null };
        } catch (error) {
          /*
           * ชุดใดชุดหนึ่งพังไม่ควรทำให้ทั้งหน้าโหลดไม่ขึ้น
           * ส่งข้อความกลับไปแสดงข้าง ๆ ชุดนั้นแทน
           */
          return {
            key: dataset.key,
            total: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return { company, items: counts };
  }

  /** รายการข้อมูลของชุดที่เลือก */
  async getItems(query: CompanyDataListQueryDto, scope: TenantScope) {
    this.assertGlobalScope(scope);

    const dataset = this.getDataset(query.dataset);
    await this.assertCompanyExists(query.companyId);

    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 50), 1), 200);

    const where: Record<string, unknown> = {
      ...this.tenantWhere(dataset, query.companyId),
      ...this.notDeletedWhere(dataset),
    };

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from || to) {
      where[dataset.dateField] = {
        ...(from ? { gte: from } : {}),
        // ส่งมาเป็นวันที่ล้วน ต้องคลุมทั้งวัน ไม่งั้นของวันสุดท้ายจะหลุด
        ...(to ? { lte: this.endOfDay(to) } : {}),
      };
    }

    const search = query.search?.trim();

    if (search) {
      where.OR = dataset.searchFields.map((field) => ({
        [field]: { contains: search, mode: "insensitive" },
      }));
    }

    const delegate = this.delegateOf(dataset);

    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy: { [dataset.dateField]: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        ...(dataset.includeEmployee
          ? {
              include: {
                employee: {
                  select: {
                    id: true,
                    employeeCode: true,
                    nickname: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            }
          : {}),
      }),
      delegate.count({ where }),
    ]);

    return {
      dataset: {
        key: dataset.key,
        label: dataset.label,
        dateLabel: dataset.dateLabel,
        softDelete: dataset.softDelete,
        deletable: dataset.deletable,
        note: dataset.note ?? null,
      },
      items: rows.map((row: Record<string, any>) =>
        this.toItem(dataset, row),
      ),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  /** ลบรายการที่เลือก (ลงถังขยะถ้าตารางรองรับ) */
  async deleteItems(dto: DeleteCompanyDataDto, scope: TenantScope) {
    this.assertGlobalScope(scope);

    const dataset = this.getDataset(dto.dataset);
    await this.assertCompanyExists(dto.companyId);

    if (!dataset.deletable) {
      throw new BadRequestException(
        dataset.note ?? "ชุดข้อมูลนี้ลบจากหน้านี้ไม่ได้",
      );
    }

    const ids = [...new Set(dto.ids.filter(Boolean))];

    if (ids.length === 0) {
      throw new BadRequestException("ยังไม่ได้เลือกรายการที่จะลบ");
    }

    /*
     * ต้องกรองด้วยเงื่อนไขบริษัทซ้ำอีกชั้น ไม่ใช่ลบด้วย id ล้วน
     * ไม่งั้นถ้ามีคนยิง id ของบริษัทอื่นปนมา จะลบข้ามบริษัทได้
     */
    const where = {
      id: { in: ids },
      ...this.tenantWhere(dataset, dto.companyId),
      ...this.notDeletedWhere(dataset),
    };

    const delegate = this.delegateOf(dataset);

    const affected = dataset.softDelete
      ? await delegate.updateMany({ where, data: { deletedAt: new Date() } })
      : await delegate.deleteMany({ where });

    return {
      requested: ids.length,
      deleted: affected.count,
      /** ลบไม่ครบ = มี id ที่ไม่ได้อยู่ในบริษัทนี้ หรือถูกลบไปแล้ว */
      skipped: ids.length - affected.count,
      softDeleted: dataset.softDelete,
    };
  }

  /** ลบทั้งชุดตามช่วงวันที่ ต้องพิมพ์ชื่อบริษัทยืนยัน */
  async purge(dto: PurgeCompanyDataDto, scope: TenantScope) {
    this.assertGlobalScope(scope);

    const dataset = this.getDataset(dto.dataset);
    const company = await this.assertCompanyExists(dto.companyId);

    if (!dataset.deletable) {
      throw new BadRequestException(
        dataset.note ?? "ชุดข้อมูลนี้ลบจากหน้านี้ไม่ได้",
      );
    }

    /*
     * ด่านสุดท้ายก่อนลบทีละหลายพันแถว — ต้องพิมพ์ชื่อบริษัทให้ตรง
     * กันเผลอกดในบริษัทที่ไม่ได้ตั้งใจ ซึ่งเป็นความผิดพลาดที่กู้คืนเหนื่อยที่สุด
     */
    const expected = company.nameTh?.trim();

    if (!expected || dto.confirmName.trim() !== expected) {
      throw new BadRequestException(
        `พิมพ์ชื่อบริษัทให้ตรงกับ "${expected}" เพื่อยืนยันการลบ`,
      );
    }

    const where: Record<string, unknown> = {
      ...this.tenantWhere(dataset, dto.companyId),
      ...this.notDeletedWhere(dataset),
    };

    const from = dto.from ? new Date(dto.from) : null;
    const to = dto.to ? new Date(dto.to) : null;

    if (from || to) {
      where[dataset.dateField] = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: this.endOfDay(to) } : {}),
      };
    }

    const delegate = this.delegateOf(dataset);

    const affected = dataset.softDelete
      ? await delegate.updateMany({ where, data: { deletedAt: new Date() } })
      : await delegate.deleteMany({ where });

    return {
      deleted: affected.count,
      softDeleted: dataset.softDelete,
    };
  }

  /* ---------------------------------------------------------------- */

  private toItem(dataset: CompanyDatasetConfig, row: Record<string, any>) {
    const employee = row.employee as
      | {
          employeeCode?: string | null;
          displayName?: string | null;
          firstName?: string | null;
          lastName?: string | null;
        }
      | undefined;

    const employeeName = employee
      ? (employee.displayName?.trim() ||
        `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
        null)
      : null;

    return {
      id: String(row.id),
      title: this.firstValue(row, dataset.titleFields) ?? String(row.id),
      subtitle: this.firstValue(row, dataset.subtitleFields ?? []),
      status: dataset.statusField
        ? this.stringify(row[dataset.statusField])
        : null,
      date: row[dataset.dateField] ?? null,
      employeeCode: employee?.employeeCode ?? null,
      employeeName,
    };
  }

  private firstValue(row: Record<string, any>, fields: string[]) {
    for (const field of fields) {
      const value = this.stringify(row[field]);
      if (value) return value;
    }

    return null;
  }

  private stringify(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();

    const text = String(value).trim();

    return text.length > 0 ? text : null;
  }

  private endOfDay(value: Date) {
    const end = new Date(value);
    end.setHours(23, 59, 59, 999);

    return end;
  }
}
