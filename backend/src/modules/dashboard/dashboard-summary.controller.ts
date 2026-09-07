import { Controller, Get, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { DashboardService } from "./dashboard.service";

/**
 * Dashboard Summary Controller
 * ----------------------------
 * Batch 8 aggregate endpoints. These endpoints let frontend dashboard pages load
 * one scoped summary payload instead of calling many list APIs and filtering in
 * the browser.
 */
@Auth()
@Controller()
export class DashboardSummaryController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("dashboard/me")
  getMyDashboardSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getMyDashboardSummary(currentUser);
  }

  /*
   * ต้องมี HR_WORKSPACE ด้วย
   * ตัวเลขก้อนนี้เป็นภาพรวมทั้งสาขา/บริษัท ไม่ใช่ของทีมใดทีมหนึ่ง
   * สี่สิทธิ์เดิมเป็นสิทธิ์อ่านที่หัวหน้างานถือครบอยู่แล้วเพราะต้องใช้กับลูกทีม
   * ด่านเดิมจึงเปิดให้หัวหน้าดึงตัวเลขระดับองค์กรได้ทาง API แม้เมนูจะซ่อนไว้
   */
  @Auth(
    "HR_WORKSPACE",
    "EMPLOYEE_READ",
    "ATTENDANCE_READ",
    "LEAVE_READ",
    "APPROVAL_ACCESS",
  )
  @Get("hr/dashboard-summary")
  getHrDashboardSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getHrDashboardSummary(currentUser.scope);
  }

  /**
   * เงินเดือน/ภาษี/ประกันสังคมของหน้า Dashboard HR
   * แยก endpoint ออกจาก hr/dashboard-summary เพราะเป็นข้อมูลเงิน
   * ต้องมี PAYROLL_READ เท่านั้นถึงจะได้ payload ก้อนนี้
   */
  @Auth("PAYROLL_READ")
  @Get("hr/dashboard-payroll-summary")
  getHrPayrollSummary(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query("year") year?: string,
  ) {
    const parsedYear = Number.parseInt(String(year ?? ""), 10);

    return this.dashboardService.getHrPayrollSummary(
      currentUser.scope,
      Number.isFinite(parsedYear) ? parsedYear : undefined,
    );
  }

  @Auth("PAYROLL_READ")
  @Get("payroll/dashboard-summary")
  getPayrollDashboardSummary(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.dashboardService.getPayrollDashboardSummary(
      {
        companyId,
        branchId,
      },
      currentUser.scope,
    );
  }

  /**
   * ตัวชี้วัดระดับผู้บริหาร — อัตราส่วน/ต่อหัว/เทียบเดือนก่อน และแยกรายแผนก
   * ต่างจาก executive/dashboard-summary ที่เป็นตัวนับเหตุการณ์
   */
  /** ใครมา ใครลา ใครสายวันนี้ รายคน — กรองตามแผนก/สาขา/สถานะได้ */
  @Auth("EXECUTIVE_VIEW")
  @Get("executive/attendance-today")
  getExecutiveAttendanceToday(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query("departmentId") departmentId?: string,
    @Query("branchId") branchId?: string,
    @Query("status") status?: string,
  ) {
    return this.dashboardService.getExecutiveAttendanceToday(currentUser.scope, {
      departmentId,
      branchId,
      status,
    });
  }

  @Auth("EXECUTIVE_VIEW")
  @Get("executive/insights")
  getExecutiveInsights(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getExecutiveInsights(currentUser.scope);
  }

  @Auth("EXECUTIVE_VIEW")
  @Get("executive/dashboard-summary")
  getExecutiveDashboardSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getExecutiveDashboardSummary(
      currentUser.scope,
    );
  }

  @Auth("ORG_MANAGE")
  @Get("admin/dashboard-summary")
  getAdminDashboardSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardService.getAdminDashboardSummary(currentUser.scope);
  }
}
