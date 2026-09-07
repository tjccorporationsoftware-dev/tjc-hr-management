import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { DashboardService } from '../../dashboard/dashboard.service';
import { ManpowerService } from '../../manpower/manpower.service';
import { OrganizationService } from '../../organization/organization.service';
import { ReportsService } from '../../reports/reports.service';
import type {
  MobileCreateExecutiveReportDto,
  MobileExecutiveAttendanceQueryDto,
  MobileExecutiveAttendanceTrendQueryDto,
  MobileExecutiveFilterDto,
  MobileExecutivePayrollQueryDto,
  MobileExecutivePeriodQueryDto,
} from '../dto/mobile-executive.dto';
import {
  toMobileExecutiveAttendanceToday,
  toMobileExecutiveInsights,
  toMobileExecutiveLeaveOtPeriod,
  toMobileExecutiveManpower,
  toMobileExecutiveDailyCost,
  toMobileExecutivePayroll,
  toMobileExecutiveSummary,
} from '../mappers/mobile-executive.mapper';

/**
 * ห้องผู้บริหารบนมือถือ
 *
 * ทุกตัวเลขมาจาก DashboardService / ManpowerService / ReportsService ชุดเดียว
 * กับที่หน้าเว็บใช้ — ที่นี่ไม่นับ ไม่รวมยอด และไม่แตะ Prisma
 *
 * ## เรื่องสิทธิ์ที่ต้องระวัง
 *
 * `EXECUTIVE_VIEW` คือด่านเข้าห้อง แต่ **ไม่ได้แปลว่าเห็นทุกอย่างในห้อง** —
 * เงินเดือนต้องมี `PAYROLL_READ` ผังองค์กรต้องมี `ORG_READ` และรายงานต้องมี
 * `REPORT_VIEW`/`REPORT_EXPORT` เพิ่ม ผู้บริหารหลายคนไม่มีสิทธิ์เงินเดือน
 *
 * ด่านย่อยพวกนี้เช็คที่นี่แทนที่จะประกาศไว้ที่ระดับ route เพราะจอเดียวกัน
 * ประกอบจากหลายแหล่ง ถ้าบังคับที่ route ทั้งจอจะเปิดไม่ได้เพราะส่วนเดียว
 */
@Injectable()
export class MobileExecutiveOrchestrator {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly manpower: ManpowerService,
    private readonly organization: OrganizationService,
    private readonly reports: ReportsService,
  ) {}

  async summary(user: AuthenticatedUser) {
    const canSeePayroll = user.permissions.includes('PAYROLL_READ');

    const [executive, payroll] = await Promise.all([
      this.dashboard.getExecutiveDashboardSummary(user.scope),
      canSeePayroll
        ? this.dashboard.getHrPayrollSummary(user.scope)
        : Promise.resolve(null),
    ]);

    return toMobileExecutiveSummary({
      executive: executive as never,
      payroll: payroll as never,
    });
  }

  async insights(user: AuthenticatedUser) {
    const insights = await this.dashboard.getExecutiveInsights(user.scope);
    const mapped = toMobileExecutiveInsights(insights as never);

    /*
     * ตัวชี้วัดต้นทุนคือข้อมูลเงินเดือนในรูปแบบต่อหัว — ผู้ที่ไม่มีสิทธิ์ดู
     * เงินเดือนต้องไม่ได้ก้อนนี้ แม้จะเปิดห้องผู้บริหารได้ก็ตาม
     * ตัดออกที่นี่แทนการส่งศูนย์ เพื่อให้แอปซ่อนการ์ดทั้งใบได้ ไม่ใช่โชว์
     * "ต้นทุนต่อหัว 0 บาท" ซึ่งอ่านผิดได้ว่าองค์กรไม่มีค่าใช้จ่าย
     */
    if (!user.permissions.includes('PAYROLL_READ')) {
      return {
        ...mapped,
        cost: null,
        costVisible: false,
        departments: mapped.departments.map((row) => ({
          ...row,
          costPerHead: 0,
        })),
        trend: mapped.trend.map((row) => ({ ...row, costPerHead: 0 })),
      };
    }

    return { ...mapped, costVisible: true };
  }

  async manpowerOverview(
    user: AuthenticatedUser,
    query: MobileExecutiveFilterDto,
  ) {
    const overview = await this.manpower.getOverview(
      {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.divisionId ? { divisionId: query.divisionId } : {}),
        ...(query.employeeTypeId
          ? { employeeTypeId: query.employeeTypeId }
          : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.search?.trim() ? { q: query.search.trim() } : {}),
      },
      user.scope,
    );

    return toMobileExecutiveManpower(overview as never);
  }

  async attendanceToday(
    user: AuthenticatedUser,
    query: MobileExecutiveAttendanceQueryDto,
  ) {
    const result = await this.dashboard.getExecutiveAttendanceToday(
      user.scope,
      {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.date ? { date: query.date } : {}),
      },
    );

    return toMobileExecutiveAttendanceToday(result as never);
  }

  /**
   * แนวโน้มการเข้างานย้อนหลัง — ส่งต่อตรง ๆ ไม่ต้องแปลงรูป
   *
   * รูปที่ DashboardService คืนมาเป็นตัวเลขล้วนกับคีย์สั้นอยู่แล้ว ไม่มีข้อมูล
   * รายบุคคลให้ต้องคัดออกเหมือนจอรายชื่อ
   */
  async attendanceTrend(
    user: AuthenticatedUser,
    query: MobileExecutiveAttendanceTrendQueryDto,
  ) {
    return this.dashboard.getExecutiveAttendanceTrend(user.scope, {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.days ? { days: Number(query.days) } : {}),
    });
  }

  async leaveOtPeriod(
    user: AuthenticatedUser,
    query: MobileExecutivePeriodQueryDto,
  ) {
    const result = await this.dashboard.getExecutiveLeaveOtPeriod(user.scope, {
      from: query.from,
      to: query.to,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    });

    return toMobileExecutiveLeaveOtPeriod(result as never);
  }

  /**
   * ค่าจ้างประมาณการของวันเดียว
   *
   * ใช้สิทธิ์ชุดเดียวกับจอค่าจ้างองค์กร เพราะเป็นข้อมูลเงินเหมือนกัน แม้จะ
   * ไม่มียอดรายคนก็ตาม — ยอดรวมของหน่วยงานที่มีคนไม่กี่คนก็เดาย้อนกลับได้
   */
  async dailyCost(
    user: AuthenticatedUser,
    query: MobileExecutiveAttendanceQueryDto,
  ) {
    this.ensurePermission(
      user,
      'PAYROLL_READ',
      'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลค่าจ้าง',
    );

    const result = await this.dashboard.getExecutiveDailyCost(user.scope, {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.date ? { date: query.date } : {}),
    });

    return toMobileExecutiveDailyCost(result as never);
  }

  async payroll(
    user: AuthenticatedUser,
    query: MobileExecutivePayrollQueryDto,
  ) {
    this.ensurePermission(
      user,
      'PAYROLL_READ',
      'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลเงินเดือนระดับองค์กร',
    );

    const result = await this.dashboard.getHrPayrollSummary(
      user.scope,
      query.year,
    );

    /* แยกรายสาขา/แผนกของ "งวดล่าสุด" — ต้องใช้รอบเดียวกับที่ตัวเลขด้านบนมา
       ไม่ใช่ไปหารอบล่าสุดใหม่เอง ไม่งั้นสองส่วนบนจอเป็นคนละงวดได้ */
    const units = await this.dashboard.getPayrollUnitCost(result.latestRunId);

    return toMobileExecutivePayroll({ ...result, units } as never);
  }

  /**
   * ผังองค์กรแบบอ่านอย่างเดียว
   *
   * ส่งต่อผลของ OrganizationService ตรง ๆ ไม่ย่อ เพราะโครงสร้างองค์กรของ
   * ลูกค้ารายนี้อยู่ในหลักสิบหน่วยงาน ไม่ใช่หลักพัน การ map ใหม่มีแต่จะทำให้
   * ผังบนแอปกับบนเว็บเริ่มไม่ตรงกันเมื่อฝั่งเว็บเพิ่มระดับชั้นใหม่
   */
  async organizationChart(user: AuthenticatedUser) {
    this.ensurePermission(
      user,
      'ORG_READ',
      'บัญชีนี้ไม่มีสิทธิ์ดูผังองค์กร',
    );

    return this.organization.getOrgChart(
      user.scope.companyId ? { companyId: user.scope.companyId } : {},
    );
  }

  async reportCatalog(user: AuthenticatedUser) {
    this.ensurePermission(
      user,
      'REPORT_VIEW',
      'บัญชีนี้ไม่มีสิทธิ์ดูรายงาน',
    );

    return { items: this.reports.getCatalog() };
  }

  async reportJobs(user: AuthenticatedUser) {
    this.ensurePermission(
      user,
      'REPORT_VIEW',
      'บัญชีนี้ไม่มีสิทธิ์ดูรายงาน',
    );

    /*
     * ดูเฉพาะงานที่ตัวเองสั่ง — จอมือถือใช้ติดตามว่า "ไฟล์ที่เพิ่งขอเสร็จหรือยัง"
     * ไม่ใช่หน้าจัดการคิวรายงานขององค์กร ซึ่งเป็นงาน Admin ที่อยู่นอกขอบเขต
     */
    const result = await this.reports.findMobileMyJobs(user.id, user.scope);

    return {
      items: (result.items as Record<string, unknown>[]).map((job) => ({
        completedAt: job.completedAt ?? null,
        createdAt: job.createdAt ?? null,
        errorMessage: job.errorMessage ?? null,
        exportFileId: job.exportFileId ?? null,
        id: String(job.id),
        name: job.name ?? null,
        reportCode: String(job.reportCode ?? ''),
        status: String(job.status ?? ''),
      })),
      meta: result.meta,
    };
  }

  /**
   * ขอรายงานหนึ่งฉบับ: สร้างงานแล้วประมวลผลต่อทันที
   *
   * ฝั่งเว็บแยกเป็นสองปุ่ม (สร้าง แล้วค่อยกดประมวลผล) เพราะผู้ใช้ตั้งค่างาน
   * ไว้ก่อนแล้วสั่งทีหลังได้ บนมือถือไม่มีสถานการณ์นั้น — ผู้บริหารกด "ขอ
   * รายงาน" แล้วต้องการไฟล์ การให้กดสองครั้งมีแต่จะทำให้เกิดงานค้างที่ไม่มี
   * ใครสั่งประมวลผล
   *
   * ถ้าประมวลผลล้มเหลว ตัวงานยังอยู่และเปิดดูสถานะได้ จึงไม่ต้องลบทิ้งเอง
   */
  async createReport(
    user: AuthenticatedUser,
    dto: MobileCreateExecutiveReportDto,
  ) {
    this.ensurePermission(
      user,
      'REPORT_EXPORT',
      'บัญชีนี้ไม่มีสิทธิ์สร้างรายงาน',
    );

    const job = (await this.reports.createJob(
      {
        reportCode: dto.reportCode,
        ...(dto.format ? { format: dto.format } : {}),
        ...(dto.companyId ? { companyId: dto.companyId } : {}),
        ...(dto.params ? { params: dto.params } : {}),
      } as never,
      user.id,
    )) as { id: string };

    const processed = (await this.reports.processJob(job.id, user.id)) as {
      exportFile?: { id?: string; fileName?: string } | null;
    };

    return {
      exportFileId: processed.exportFile?.id ?? null,
      fileName: processed.exportFile?.fileName ?? null,
      jobId: job.id,
    };
  }

  private ensurePermission(
    user: AuthenticatedUser,
    permission: string,
    message: string,
  ) {
    if (!user.permissions.includes(permission)) {
      throw new ForbiddenException(message);
    }
  }
}
