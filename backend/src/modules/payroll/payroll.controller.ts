import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";
import { PayslipQueryDto } from "./dto/payslip-query.dto";
import { AuditAction } from "../../generated/prisma/client";
import {
  CreateEmployeeCompensationDto,
  EmployeeCompensationQueryDto,
  UpdateEmployeeCompensationDto,
} from "./dto/employee-compensation.dto";
import {
  CreatePayrollComponentDto,
  UpdatePayrollComponentDto,
} from "./dto/payroll-component.dto";
import {
  CreatePayrollPeriodDto,
  UpdatePayrollPeriodDto,
} from "./dto/payroll-period.dto";
import { PayrollListQueryDto } from "./dto/payroll-query.dto";
import { PayrollService } from "./payroll.service";
import { toPayslipPaperLayout } from "./payroll-payslip-pdf.util";
import archiver from "archiver";
import { PayrollTaxCalculatorService } from "./services/payroll-tax-calculator.service";
import { PayrollProgressService } from "./services/payroll-progress.service";
import { EmployeeCompensationItemsService } from "./services/employee-compensation-items.service";
import { PayrollAdjustmentsService } from "./services/payroll-adjustments.service";
import { AttendancePayrollRulesService } from "./services/attendance-payroll-rules.service";
import {
  CreateEmployeeCompensationItemDto,
  EmployeeCompensationItemQueryDto,
  UpdateEmployeeCompensationItemDto,
} from "./dto/employee-compensation-item.dto";
import {
  CreatePayrollAdjustmentDto,
  PayrollAdjustmentActionDto,
  PayrollAdjustmentQueryDto,
  UpdatePayrollAdjustmentDto,
} from "./dto/payroll-adjustment.dto";
import {
  AttendancePayrollRuleQueryDto,
  CreateAttendancePayrollRuleDto,
  UpdateAttendancePayrollRuleDto,
} from "./dto/attendance-payroll-rule.dto";

import {
  CalculatePayrollRunDto,
  CancelPayrollRunDto,
  CreatePayrollRunDto,
  PayrollRunQueryDto,
} from "./dto/payroll-run.dto";
import { PayrollRunTaxPreviewDto } from "./dto/payroll-tax.dto";

import {
  ApprovePayrollRunDto,
  MarkPayrollRunPaidDto,
  ReviewPayrollRunDto,
} from "./dto/payroll-run-action.dto";

/**
 * PayrollController
 *
 * Controller หลักของระบบ Payroll
 *
 * หมายเหตุสำคัญสำหรับการดูแลโค้ด:
 * - ห้ามเปลี่ยน path เดิมถ้า frontend ใช้งานอยู่แล้ว
 * - สิทธิ์ Auth(...) แต่ละ route ผูกกับ permission ของระบบ
 * - Controller นี้ควรทำหน้าที่รับ request แล้วส่งต่อไป PayrollService เท่านั้น
 * - Business logic หนัก ๆ ควรอยู่ใน service ไม่ควรใส่ใน controller
 */
@Controller("payroll")
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly employeeCompensationItemsService: EmployeeCompensationItemsService,
    private readonly payrollAdjustmentsService: PayrollAdjustmentsService,
    private readonly attendancePayrollRulesService: AttendancePayrollRulesService,
    private readonly payrollTaxCalculatorService: PayrollTaxCalculatorService,
    private readonly payrollProgressService: PayrollProgressService,
  ) {}

  private getPayrollRunResponseMode(response?: string): "detail" | "summary" {
    return response === "summary" || response === "compact"
      ? "summary"
      : "detail";
  }

  /* =========================================================
   * PAYROLL RUN ROUTES
   * จัดการรอบเงินเดือน: create, calculate, review, approve, paid, cancel
   * ========================================================= */

  @Get("runs")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRun",
    description: "View payroll runs",
  })
  findRuns(
    @Query() query: PayrollRunQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRuns(query, user.scope);
  }

  @Get("runs/:id/payslips")
  @Auth("PAYROLL_SLIP_VIEW")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPayslip",
    description: "View payroll run payslips",
  })
  findPayslipsByRun(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayslipQueryDto,
  ) {
    return this.payrollService.findPayslipsByRun(id, user.scope, query);
  }

  /**
   * สลิปทั้งรอบเป็นไฟล์ ZIP ไฟล์เดียว
   *
   * ส่งแบบสตรีม — ทยอยเขียนออกไปทีละใบระหว่างสร้าง ไม่ได้รอให้ครบก่อนค่อยส่ง
   * ถ้ารอจนครบ (130 คนใช้เวลาราว 40 วินาที) reverse proxy จะมองว่าเงียบเกินไป
   * แล้วตัดการเชื่อมต่อทิ้งกลางทาง
   */
  @Get("runs/:id/payslips/zip")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "payroll:payslip:zip",
    // งานหนักกว่าโหลดทีละใบมาก จำกัดให้แน่นกว่า
    limit: 5,
    windowSeconds: 300,
    includeUserId: true,
    includePath: true,
    message: "ออกสลิปทั้งรอบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Auth("PAYROLL_SLIP_VIEW")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPayslip",
    description: "Download all payslips of a run as ZIP",
  })
  async downloadRunPayslipsZip(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query("layout") layout?: string,
  ) {
    const paperLayout = toPayslipPaperLayout(layout);
    const archive = archiver("zip", { zlib: { level: 6 } });

    /*
     * ตั้ง header ก่อนเขียนอะไรลง response — พอเริ่มสตรีมแล้วแก้ไม่ได้อีก
     * และด้วยเหตุผลเดียวกัน ถ้าพังหลังเริ่มสตรีมจะส่ง error กลับไม่ได้ ทำได้แค่
     * ตัดสายทิ้งให้ไฟล์เสียเพื่อให้ผู้ใช้รู้ว่าไม่สมบูรณ์
     */
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payslips-${id}.zip"`,
    );

    archive.on("error", () => res.destroy());
    archive.pipe(res);

    try {
      const result = await this.payrollService.streamRunPayslipsZip(
        id,
        user.scope,
        paperLayout,
        archive,
      );

      if (result.failed.length > 0) {
        archive.append(
          Buffer.from(
            [
              "สลิปที่สร้างไม่สำเร็จ",
              "====================",
              ...result.failed,
              "",
              `สร้างสำเร็จ ${result.total - result.failed.length} จาก ${result.total} ใบ`,
            ].join("\n"),
            "utf8",
          ),
          { name: "รายการที่ไม่สำเร็จ.txt" },
        );
      }

      await archive.finalize();
    } catch (error) {
      archive.destroy();

      /* ยังไม่ได้ส่งอะไรออกไป จึงตอบเป็น error ปกติได้ */
      if (!res.headersSent) {
        throw error;
      }

      res.destroy();
    }
  }

  @Get("payslips/:itemId/pdf")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    keyPrefix: "payroll:payslip:download",
    limit: 60,
    windowSeconds: 60,
    includeUserId: true,
    includePath: true,
    message: "ดาวน์โหลดสลิปเงินเดือนบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  })
  @Auth("PAYROLL_SLIP_VIEW")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPayslip",
    description: "Download payroll payslip PDF",
  })
  async downloadPayslipPdf(
    @Param("itemId") itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query("layout") layout?: string,
  ) {
    const pdf = await this.payrollService.generatePayslipPdfByItemId(
      itemId,
      user.scope,
      toPayslipPaperLayout(layout),
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${pdf.fileName}"`,
    );
    res.setHeader("Content-Length", String(pdf.buffer.length));

    return res.end(pdf.buffer);
  }

  @Get("payslips/:itemId")
  @Auth("PAYROLL_SLIP_VIEW")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPayslip",
    description: "View payroll payslip detail",
  })
  findPayslipByItemId(
    @Param("itemId") itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findPayslipByItemId(itemId, user.scope);
  }

  @Get("runs/:id/validation")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunValidation",
    description: "Validate payroll run before approval or payment",
  })
  findRunValidation(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunValidation(id, user.scope);
  }

  @Post("runs/:id/tax-preview")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollTaxCalculation",
    description: "Preview payroll run tax calculation",
  })
  previewRunTax(
    @Param("id") id: string,
    @Body() dto: PayrollRunTaxPreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollTaxCalculatorService.calculateRunPreview(
      id,
      dto,
      user.scope,
    );
  }

  @Get("runs/:id/readiness")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunReadiness",
    description: "View payroll readiness before calculation",
  })
  findRunReadiness(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunReadiness(id, user.scope);
  }

  @Get("runs/:id/line-audit")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollLineAudit",
    description: "Audit payroll line sources and totals",
  })
  findRunLineAudit(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunLineAudit(id, user.scope);
  }

  @Get("runs/:id/source-preview")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunSourcePreview",
    description: "View payroll source preview before calculation",
  })
  findRunSourcePreview(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunSourcePreview(id, user.scope);
  }

  @Post("runs/:id/precheck")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunReadiness",
    description: "Precheck payroll readiness before calculation",
  })
  precheckRun(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculatePayrollRunDto,
  ) {
    return this.payrollService.precheckRun(id, user.scope, dto.employeeIds);
  }

  @Post("runs/:id/dry-run")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunDryRun",
    description: "Dry run payroll calculation without saving lines",
  })
  dryRun(@Param("id") id: string, @Body() dto: CalculatePayrollRunDto) {
    return this.payrollService.dryRun(id, dto.employeeIds);
  }

  @Get("runs/:id/payslip-publication-status")
  @Auth("PAYROLL_SLIP_VIEW")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPayslipPublication",
    description: "View payroll payslip publication status",
  })
  getRunPayslipPublicationStatus(@Param("id") id: string) {
    return this.payrollService.getRunPayslipPublicationStatus(id);
  }

  @Post("runs/:id/publish-payslips")
  @Auth("PAYROLL_PAYMENT_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollPayslipPublication",
    description: "Publish payroll run payslips",
  })
  publishRunPayslips(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.publishRunPayslips(id, user.scope, user.id);
  }

  @Post("runs/:id/unpublish-payslips")
  @Auth("PAYROLL_PAYMENT_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollPayslipPublication",
    description: "Unpublish payroll run payslips",
  })
  unpublishRunPayslips(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.unpublishRunPayslips(id, user.scope, user.id);
  }

  @Post("runs/:id/show-payslip-details")
  @Auth("PAYROLL_PAYMENT_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollPayslipDetailVisibility",
    description: "Show payroll run payslips in ESS",
  })
  showRunPayslipDetails(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.setRunPayslipDetailsVisibility(id, true, user.id);
  }

  @Post("runs/:id/hide-payslip-details")
  @Auth("PAYROLL_PAYMENT_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollPayslipDetailVisibility",
    description: "Hide payroll run payslips in ESS",
  })
  hideRunPayslipDetails(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.setRunPayslipDetailsVisibility(id, false, user.id);
  }

  @Get("runs/:id/attendance-deductions")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollAttendanceDeduction",
    description: "View payroll attendance deductions",
  })
  findRunAttendanceDeductions(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunAttendanceDeductions(id, user.scope);
  }

  @Post("runs/:id/import-attendance-deductions")
  @Auth("PAYROLL_CALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollAttendanceDeduction",
    description: "Import payroll attendance deductions",
  })
  importRunAttendanceDeductions(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.importAttendanceDeductionsForRun(id, user.scope, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  @Post("runs/:id/recalculate-attendance-deductions")
  @Auth("PAYROLL_CALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollAttendanceDeduction",
    description: "Recalculate payroll attendance deductions",
  })
  recalculateRunAttendanceDeductions(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.recalculateAttendanceDeductionsForRun(
      id,
      user.scope,
      user.id,
      {
        responseMode: this.getPayrollRunResponseMode(response),
      },
    );
  }

  @Get("runs/:id/export/excel")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.EXPORT,
    entity: "PayrollRun",
    description: "Export payroll run Excel",
  })
  async exportRunExcel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.payrollService.generateRunExcel(id, user.scope);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    );
    res.setHeader("Content-Length", String(file.buffer.length));

    return res.end(file.buffer);
  }

  @Get("runs/:id/export/pdf")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.EXPORT,
    entity: "PayrollRun",
    description: "Export payroll run PDF",
  })
  async exportRunPdf(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.payrollService.generateRunPdf(id, user.scope);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    );
    res.setHeader("Content-Length", String(file.buffer.length));

    return res.end(file.buffer);
  }

  @Get("runs/:id/progress")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRunProgress",
    description: "View payroll run realtime progress",
  })
  findRunProgress(@Param("id") id: string) {
    return this.payrollProgressService.get(id);
  }

  @Get("runs/:id")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollRun",
    description: "View payroll run detail",
  })
  findRunById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findRunById(id, user.scope);
  }

  @Post("runs")
  @Auth("PAYROLL_CALCULATE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "PayrollRun",
    description: "Create payroll run",
  })
  createRun(
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.createRun(dto, user.id, user.scope);
  }

  @Post("runs/:id/calculate")
  @Auth("PAYROLL_CALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollRun",
    description: "Calculate payroll run",
  })
  calculateRun(
    @Param("id") id: string,
    @Body() dto: CalculatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.calculateRun(id, user.scope, dto, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  @Post("runs/:id/review")
  @Auth("PAYROLL_APPROVE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollRun",
    description: "Review payroll run",
  })
  reviewRun(
    @Param("id") id: string,
    @Body() dto: ReviewPayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.reviewRun(id, user.scope, dto, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  @Post("runs/:id/approve")
  @Auth("PAYROLL_APPROVE")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "PayrollRun",
    description: "Approve payroll run",
  })
  approveRun(
    @Param("id") id: string,
    @Body() dto: ApprovePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.approveRun(id, user.scope, dto, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  @Post("runs/:id/paid")
  @Auth("PAYROLL_PAYMENT_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollRun",
    description: "Mark payroll run as paid",
  })
  markRunPaid(
    @Param("id") id: string,
    @Body() dto: MarkPayrollRunPaidDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.markRunPaid(id, user.scope, dto, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  @Post("runs/:id/cancel")
  @Auth("PAYROLL_CALCULATE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollRun",
    description: "Cancel payroll run",
  })
  cancelRun(
    @Param("id") id: string,
    @Body() dto: CancelPayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query("response") response?: string,
  ) {
    return this.payrollService.cancelRun(id, user.scope, dto, user.id, {
      responseMode: this.getPayrollRunResponseMode(response),
    });
  }

  /* =========================================================
   * PAYROLL COMPONENT ROUTES
   * รายการเงินเดือน เช่น เงินเดือนประจำ, OT, รายการหัก, allowance
   * ========================================================= */

  @Get("components")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollComponent",
    description: "View payroll components",
  })
  findComponents(
    @Query() query: PayrollListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findComponents(query, user.scope);
  }

  @Post("components")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "PayrollComponent",
    description: "Create payroll component",
  })
  createComponent(
    @Body() dto: CreatePayrollComponentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.createComponent(dto, user.scope);
  }

  @Patch("components/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollComponent",
    description: "Update payroll component",
  })
  updateComponent(
    @Param("id") id: string,
    @Body() dto: UpdatePayrollComponentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.updateComponent(id, dto, user.scope);
  }

  @Delete("components/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "PayrollComponent",
    description: "Delete payroll component",
  })
  deleteComponent(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.deleteComponent(id, user.scope);
  }

  /* =========================================================
   * PAYROLL PERIOD ROUTES
   * งวดเงินเดือน เช่น เดือน/ปี วันที่เริ่ม-สิ้นสุด และวันจ่ายเงิน
   * ========================================================= */

  @Get("periods")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPeriod",
    description: "View payroll periods",
  })
  findPeriods(
    @Query() query: PayrollListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findPeriods(query, user.scope);
  }

  @Get("periods/:id")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollPeriod",
    description: "View payroll period",
  })
  findPeriodById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findPeriodById(id, user.scope);
  }

  @Post("periods")
  @Auth("PAYROLL_PERIOD_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "PayrollPeriod",
    description: "Create payroll period",
  })
  createPeriod(
    @Body() dto: CreatePayrollPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.createPeriod(dto, user.id, user.scope);
  }

  @Patch("periods/:id")
  @Auth("PAYROLL_PERIOD_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollPeriod",
    description: "Update payroll period",
  })
  updatePeriod(
    @Param("id") id: string,
    @Body() dto: UpdatePayrollPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.updatePeriod(id, dto, user.scope);
  }

  @Delete("periods/:id")
  @Auth("PAYROLL_PERIOD_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "PayrollPeriod",
    description: "Delete payroll period",
  })
  deletePeriod(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.deletePeriod(id, user.scope);
  }

  /* =========================================================
   * EMPLOYEE COMPENSATION ROUTES
   * ฐานเงินเดือน/ค่าจ้างของพนักงาน
   * ========================================================= */

  @Get("compensations")
  @Auth("PAYROLL_COMPENSATION_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "EmployeeCompensation",
    description: "View employee compensations",
  })
  findCompensations(
    @Query() query: EmployeeCompensationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.findCompensations(query, user.scope);
  }

  @Post("compensations")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "EmployeeCompensation",
    description: "Create employee compensation",
  })
  createCompensation(
    @Body() dto: CreateEmployeeCompensationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.createCompensation(dto, user.scope);
  }

  @Patch("compensations/:id")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "EmployeeCompensation",
    description: "Update employee compensation",
  })
  updateCompensation(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeCompensationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.updateCompensation(id, dto, user.scope);
  }

  @Delete("compensations/:id")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "EmployeeCompensation",
    description: "Delete employee compensation",
  })
  deleteCompensation(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.deleteCompensation(id, user.scope);
  }

  /* =========================================================
   * EMPLOYEE COMPENSATION ITEM ROUTES
   * รายการค่าตอบแทน/รายหักประจำของพนักงาน เช่น ค่าเดินทาง ค่าโทรศัพท์
   * ========================================================= */

  @Get("compensation-items")
  @Auth("PAYROLL_COMPENSATION_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "EmployeeCompensationItem",
    description: "View employee recurring compensation items",
  })
  findCompensationItems(@Query() query: EmployeeCompensationItemQueryDto) {
    return this.employeeCompensationItemsService.findAll(query);
  }

  @Post("compensation-items")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "EmployeeCompensationItem",
    description: "Create employee recurring compensation item",
  })
  createCompensationItem(
    @Body() dto: CreateEmployeeCompensationItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeCompensationItemsService.create(dto, user.scope);
  }

  @Patch("compensation-items/:id")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "EmployeeCompensationItem",
    description: "Update employee recurring compensation item",
  })
  updateCompensationItem(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeCompensationItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeCompensationItemsService.update(id, dto, user.scope);
  }

  @Delete("compensation-items/:id")
  @Auth("PAYROLL_COMPENSATION_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "EmployeeCompensationItem",
    description: "Delete employee recurring compensation item",
  })
  deleteCompensationItem(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeeCompensationItemsService.remove(id, user.scope);
  }

  /* =========================================================
   * PAYROLL ADJUSTMENT ROUTES
   * รายการเพิ่ม/หักเฉพาะงวด เช่น โบนัส ค่าคอม หักเงินยืม
   * ========================================================= */

  @Get("adjustments")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "PayrollAdjustment",
    description: "View payroll adjustments",
  })
  findAdjustments(@Query() query: PayrollAdjustmentQueryDto) {
    return this.payrollAdjustmentsService.findAll(query);
  }

  @Post("adjustments")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "PayrollAdjustment",
    description: "Create payroll adjustment",
  })
  createAdjustment(
    @Body() dto: CreatePayrollAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollAdjustmentsService.create(dto, user.id, user.scope);
  }

  @Patch("adjustments/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollAdjustment",
    description: "Update payroll adjustment",
  })
  updateAdjustment(
    @Param("id") id: string,
    @Body() dto: UpdatePayrollAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollAdjustmentsService.update(id, dto, user.scope);
  }

  @Post("adjustments/:id/approve")
  @Auth("PAYROLL_APPROVE")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "PayrollAdjustment",
    description: "Approve payroll adjustment",
  })
  approveAdjustment(
    @Param("id") id: string,
    @Body() dto: PayrollAdjustmentActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollAdjustmentsService.approve(id, dto, user.id, user.scope);
  }

  @Post("adjustments/:id/cancel")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "PayrollAdjustment",
    description: "Cancel payroll adjustment",
  })
  cancelAdjustment(
    @Param("id") id: string,
    @Body() dto: PayrollAdjustmentActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollAdjustmentsService.cancel(id, dto, user.id, user.scope);
  }

  @Delete("adjustments/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "PayrollAdjustment",
    description: "Delete payroll adjustment",
  })
  deleteAdjustment(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollAdjustmentsService.remove(id, user.scope);
  }

  /* =========================================================
   * ATTENDANCE PAYROLL RULE ROUTES
   * กติกาหักเงินจากระบบเวลา เช่น มาสาย ขาดงาน ออกก่อน
   * ========================================================= */

  @Get("attendance-rules")
  @Auth("PAYROLL_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "AttendancePayrollRule",
    description: "View attendance payroll rules",
  })
  findAttendanceRules(@Query() query: AttendancePayrollRuleQueryDto) {
    return this.attendancePayrollRulesService.findAll(query);
  }

  @Post("attendance-rules")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "AttendancePayrollRule",
    description: "Create attendance payroll rule",
  })
  createAttendanceRule(
    @Body() dto: CreateAttendancePayrollRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendancePayrollRulesService.create(dto, user.scope);
  }

  @Patch("attendance-rules/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "AttendancePayrollRule",
    description: "Update attendance payroll rule",
  })
  updateAttendanceRule(
    @Param("id") id: string,
    @Body() dto: UpdateAttendancePayrollRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendancePayrollRulesService.update(id, dto, user.scope);
  }

  @Delete("attendance-rules/:id")
  @Auth("PAYROLL_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "AttendancePayrollRule",
    description: "Delete attendance payroll rule",
  })
  deleteAttendanceRule(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendancePayrollRulesService.remove(id, user.scope);
  }
}
