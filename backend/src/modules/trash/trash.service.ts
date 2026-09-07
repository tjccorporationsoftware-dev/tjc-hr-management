import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import { TrashQueryDto } from "./dto/trash-query.dto";

/**
 * เส้นทางที่ใช้ผูกรายการในถังขยะกับบริษัท
 *
 * "direct"   = ตารางมีคอลัมน์ companyId เอง
 * "employee" = ผูกผ่าน employee.companyId
 * ไม่ระบุ    = ไม่มีเส้นทางถึงบริษัท (ไฟล์แนบ / master กลาง / Company / User)
 *              ตัวที่ไม่มีเส้นทางจะเปิดให้เฉพาะผู้ดูแลระดับ GLOBAL เท่านั้น
 *              เพราะถ้าปล่อยผ่านจะกลายเป็นช่องอ่าน-ลบข้อมูลข้ามบริษัท
 */
type TenantPath = "direct" | "employee";

const TENANT_PATHS: Record<string, TenantPath> = {
  ApprovalMatrix: "direct",
  ApprovalMatrixStep: "employee",
  AttendanceLocation: "direct",
  AttendanceLog: "employee",
  AttendancePayrollRule: "direct",
  AttendancePolicy: "direct",
  Branch: "direct",
  Complaint: "direct",
  Department: "direct",
  DisciplinaryHistory: "direct",
  DocumentRequest: "direct",
  DocumentTemplate: "direct",
  DocumentType: "direct",
  Employee: "direct",
  EmployeeCompensation: "direct",
  EmployeeCompensationItem: "direct",
  EmployeeDocument: "employee",
  EmployeeTaxProfile: "direct",
  EmployeeType: "direct",
  EvaluationForm: "direct",
  EvaluationResult: "direct",
  Evaluator: "employee",
  ExportFile: "direct",
  HolidayCalendar: "direct",
  HolidayWorkAssignment: "direct",
  LeavePolicy: "direct",
  LeaveRequest: "employee",
  LeaveType: "direct",
  OffsiteWorkRequest: "direct",
  OnboardingChecklist: "direct",
  OnboardingDocument: "direct",
  OnboardingTask: "direct",
  OvertimePolicy: "direct",
  OvertimeRequest: "employee",
  PaymentAccount: "direct",
  PayrollAdjustment: "direct",
  PayrollComponent: "direct",
  PayrollPeriod: "direct",
  PayrollRun: "direct",
  PayrollTaxYear: "direct",
  Position: "direct",
  ProbationRecord: "direct",
  ReportJob: "direct",
  SocialInsuranceMethod: "direct",
  SubstituteHolidayCredit: "direct",
  TaxMethod: "direct",
  TimeAdjustRequest: "employee",
  WarningLetter: "direct",
};

/**
 * where-fragment สำหรับกรองรายการในถังขยะให้เหลือเฉพาะบริษัทของผู้เรียก
 * คืน null เมื่อโมเดลนั้นไม่มีเส้นทางถึงบริษัท (ผู้เรียกที่ไม่ใช่ GLOBAL ไม่ควรเห็น)
 */
function tenantWhereForModel(
  config: TrashModelConfig,
  scope: TenantScope,
): Record<string, unknown> | null {
  if (scope.level === "GLOBAL") {
    return {};
  }

  const path = TENANT_PATHS[config.model];

  if (!path) {
    return null;
  }

  if (path === "direct") {
    return { companyId: scope.companyId };
  }

  return { employee: { is: { companyId: scope.companyId } } };
}

type TrashModelConfig = {
  type: string;
  model: string;
  delegate: string;
  group: string;
  label: string;
  titleFields: string[];
  subtitleFields?: string[];
  searchFields?: string[];
  restoreData?: Record<string, unknown>;
};

type TrashItem = {
  id: string;
  type: string;
  model: string;
  group: string;
  typeLabel: string;
  title: string;
  subtitle?: string | null;
  code?: string | null;
  status?: string | null;
  deletedAt: Date;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  meta: Record<string, unknown>;
};

const MASTER_RESTORE = { status: "ACTIVE" };

const TRASH_MODELS: TrashModelConfig[] = [
  { type: "user", model: "User", delegate: "user", group: "admin", label: "ผู้ใช้งาน", titleFields: ["displayName", "email"], subtitleFields: ["email", "phone"], searchFields: ["displayName", "email", "phone"], restoreData: { status: "ACTIVE" } },
  { type: "company", model: "Company", delegate: "company", group: "organization", label: "บริษัท", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "taxId"], searchFields: ["code", "nameTh", "nameEn", "taxId"], restoreData: MASTER_RESTORE },
  { type: "branch", model: "Branch", delegate: "branch", group: "organization", label: "สาขา", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "companyId"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "department", model: "Department", delegate: "department", group: "organization", label: "แผนก", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "companyId"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "division", model: "Division", delegate: "division", group: "organization", label: "ฝ่าย/ส่วนงาน", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "departmentId"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "employee-type", model: "EmployeeType", delegate: "employeeType", group: "organization", label: "ประเภทพนักงาน", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "position", model: "Position", delegate: "position", group: "organization", label: "ตำแหน่ง", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "approval-matrix", model: "ApprovalMatrix", delegate: "approvalMatrix", group: "organization", label: "สายอนุมัติ", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "targetType"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "approval-matrix-step", model: "ApprovalMatrixStep", delegate: "approvalMatrixStep", group: "organization", label: "ขั้นอนุมัติ", titleFields: ["nameTh", "roleCode", "id"], subtitleFields: ["approverType", "matrixId"], searchFields: ["nameTh", "roleCode"], restoreData: MASTER_RESTORE },
  { type: "payment-account", model: "PaymentAccount", delegate: "paymentAccount", group: "organization", label: "บัญชีจ่ายเงิน", titleFields: ["accountName", "bankName", "code"], subtitleFields: ["accountNumber", "branchName"], searchFields: ["code", "bankName", "accountName", "accountNumber"], restoreData: MASTER_RESTORE },
  { type: "tax-method", model: "TaxMethod", delegate: "taxMethod", group: "organization", label: "วิธีภาษี", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },
  { type: "social-insurance-method", model: "SocialInsuranceMethod", delegate: "socialInsuranceMethod", group: "organization", label: "วิธีประกันสังคม", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code"], searchFields: ["code", "nameTh", "nameEn"], restoreData: MASTER_RESTORE },

  { type: "employee", model: "Employee", delegate: "employee", group: "employee", label: "พนักงาน", titleFields: ["displayName", "employeeCode", "email"], subtitleFields: ["employeeCode", "email", "phone"], searchFields: ["displayName", "employeeCode", "firstName", "lastName", "email", "phone"], restoreData: { status: "ACTIVE" } },
  { type: "employee-document", model: "EmployeeDocument", delegate: "employeeDocument", group: "employee", label: "เอกสารพนักงาน", titleFields: ["title", "fileName"], subtitleFields: ["type", "employeeId"], searchFields: ["title", "fileName", "description"], restoreData: { status: "ACTIVE" } },

  { type: "holiday-calendar", model: "HolidayCalendar", delegate: "holidayCalendar", group: "attendance", label: "วันหยุด", titleFields: ["name", "date"], subtitleFields: ["holidayType"], searchFields: ["name"], restoreData: MASTER_RESTORE },
  { type: "holiday-work-assignment", model: "HolidayWorkAssignment", delegate: "holidayWorkAssignment", group: "attendance", label: "กำหนดทำงานวันหยุด", titleFields: ["name", "reason"], subtitleFields: ["targetType", "targetId"], searchFields: ["name", "reason"], restoreData: { status: "ACTIVE" } },
  { type: "substitute-holiday-credit", model: "SubstituteHolidayCredit", delegate: "substituteHolidayCredit", group: "attendance", label: "เครดิตวันหยุดชดเชย", titleFields: ["holidayNameSnapshot", "workAssignmentNameSnapshot", "reasonSnapshot"], subtitleFields: ["employeeId", "sourceType"], searchFields: ["holidayNameSnapshot", "workAssignmentNameSnapshot", "reasonSnapshot"] },
  { type: "attendance-location", model: "AttendanceLocation", delegate: "attendanceLocation", group: "attendance", label: "สถานที่ลงเวลา", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "type"], searchFields: ["code", "nameTh", "nameEn", "address"], restoreData: MASTER_RESTORE },
  { type: "attendance-device", model: "AttendanceDevice", delegate: "attendanceDevice", group: "attendance", label: "อุปกรณ์ลงเวลา", titleFields: ["name", "code"], subtitleFields: ["type", "serialNo"], searchFields: ["code", "name", "serialNo", "ipAddress"], restoreData: MASTER_RESTORE },
  { type: "attendance-policy", model: "AttendancePolicy", delegate: "attendancePolicy", group: "attendance", label: "นโยบายเวลาเข้าออก", titleFields: ["name", "code"], subtitleFields: ["code", "companyId"], searchFields: ["code", "name", "description"], restoreData: MASTER_RESTORE },
  { type: "attendance-session-rule", model: "AttendanceSessionRule", delegate: "attendanceSessionRule", group: "attendance", label: "รอบเวลาลงงาน", titleFields: ["label", "sessionCode"], subtitleFields: ["punchType", "policyId"], searchFields: ["label"] , restoreData: MASTER_RESTORE },
  { type: "attendance-log", model: "AttendanceLog", delegate: "attendanceLog", group: "attendance", label: "บันทึกลงเวลา", titleFields: ["source", "session", "id"], subtitleFields: ["employeeId", "logType"], searchFields: ["source", "session"] },
  { type: "attendance-payroll-rule", model: "AttendancePayrollRule", delegate: "attendancePayrollRule", group: "attendance", label: "กติกาหักเงินจากเวลา", titleFields: ["name", "code"], subtitleFields: ["kind", "unit"], searchFields: ["code", "name", "description"], restoreData: MASTER_RESTORE },

  { type: "leave-type", model: "LeaveType", delegate: "leaveType", group: "leave", label: "ประเภทการลา", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "companyId"], searchFields: ["code", "nameTh", "nameEn", "description"], restoreData: MASTER_RESTORE },
  { type: "leave-policy", model: "LeavePolicy", delegate: "leavePolicy", group: "leave", label: "นโยบายการลา", titleFields: ["quotaPeriod", "id"], subtitleFields: ["companyId", "leaveTypeId"], searchFields: ["quotaPeriod"], restoreData: MASTER_RESTORE },
  { type: "leave-request", model: "LeaveRequest", delegate: "leaveRequest", group: "leave", label: "คำขอลา", titleFields: ["requestNo", "reason", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["requestNo", "reason", "note"] },
  { type: "leave-attachment", model: "LeaveAttachment", delegate: "leaveAttachment", group: "leave", label: "ไฟล์แนบใบลา", titleFields: ["title", "fileName"], subtitleFields: ["leaveRequestId"], searchFields: ["title", "fileName", "description"] },

  { type: "overtime-policy", model: "OvertimePolicy", delegate: "overtimePolicy", group: "overtime", label: "นโยบาย OT", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "workType"], searchFields: ["code", "nameTh", "nameEn", "description"], restoreData: MASTER_RESTORE },
  { type: "overtime-request", model: "OvertimeRequest", delegate: "overtimeRequest", group: "overtime", label: "คำขอ OT", titleFields: ["requestNo", "reason", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["requestNo", "reason", "note"] },
  { type: "overtime-attachment", model: "OvertimeAttachment", delegate: "overtimeAttachment", group: "overtime", label: "ไฟล์แนบ OT", titleFields: ["title", "fileName"], subtitleFields: ["overtimeRequestId"], searchFields: ["title", "fileName", "description"] },

  { type: "time-adjust-request", model: "TimeAdjustRequest", delegate: "timeAdjustRequest", group: "time-adjust", label: "คำขอแก้เวลา", titleFields: ["requestNo", "reason", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["requestNo", "reason", "note"] },
  { type: "time-adjust-attachment", model: "TimeAdjustAttachment", delegate: "timeAdjustAttachment", group: "time-adjust", label: "ไฟล์แนบแก้เวลา", titleFields: ["title", "fileName"], subtitleFields: ["timeAdjustRequestId"], searchFields: ["title", "fileName", "description"] },

  { type: "document-type", model: "DocumentType", delegate: "documentType", group: "document", label: "ประเภทเอกสาร", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "category"], searchFields: ["code", "nameTh", "nameEn", "description"], restoreData: MASTER_RESTORE },
  { type: "document-request", model: "DocumentRequest", delegate: "documentRequest", group: "document", label: "คำขอเอกสาร", titleFields: ["title", "requestNo", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["requestNo", "title", "purpose", "note"] },
  { type: "document-file", model: "DocumentFile", delegate: "documentFile", group: "document", label: "ไฟล์เอกสาร", titleFields: ["title", "fileName"], subtitleFields: ["documentRequestId", "fileType"], searchFields: ["title", "fileName", "description"] },
  { type: "document-template", model: "DocumentTemplate", delegate: "documentTemplate", group: "document", label: "เทมเพลตเอกสาร", titleFields: ["name", "code"], subtitleFields: ["code", "version"], searchFields: ["code", "name", "description"], restoreData: MASTER_RESTORE },
  { type: "complaint", model: "Complaint", delegate: "complaint", group: "document", label: "เรื่องร้องเรียน", titleFields: ["title", "complaintNo"], subtitleFields: ["employeeId", "status"], searchFields: ["complaintNo", "title", "category", "description", "expectation", "note"] },

  { type: "evaluation-form", model: "EvaluationForm", delegate: "evaluationForm", group: "performance", label: "แบบประเมิน", titleFields: ["name", "code"], subtitleFields: ["periodType", "companyId"], searchFields: ["code", "name", "description"], restoreData: { status: "ACTIVE" } },
  { type: "evaluator", model: "Evaluator", delegate: "evaluator", group: "performance", label: "ผู้ประเมิน", titleFields: ["note", "id"], subtitleFields: ["formId", "employeeId"], searchFields: ["note"], restoreData: MASTER_RESTORE },
  { type: "evaluation-result", model: "EvaluationResult", delegate: "evaluationResult", group: "performance", label: "ผลประเมิน", titleFields: ["periodName", "summary", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["periodName", "summary", "recommendation", "note"] },
  { type: "evaluation-attachment", model: "EvaluationAttachment", delegate: "evaluationAttachment", group: "performance", label: "ไฟล์แนบประเมิน", titleFields: ["title", "fileName"], subtitleFields: ["evaluationResultId"], searchFields: ["title", "fileName", "description"] },
  { type: "warning-letter", model: "WarningLetter", delegate: "warningLetter", group: "performance", label: "หนังสือเตือน", titleFields: ["subject", "letterNo"], subtitleFields: ["employeeId", "severity"], searchFields: ["letterNo", "subject", "description", "correctiveAction", "employeeResponse", "note"] },
  { type: "disciplinary-history", model: "DisciplinaryHistory", delegate: "disciplinaryHistory", group: "performance", label: "ประวัติวินัย", titleFields: ["title", "detail"], subtitleFields: ["employeeId", "type"], searchFields: ["title", "detail", "actionTaken", "note"] },

  { type: "onboarding-checklist", model: "OnboardingChecklist", delegate: "onboardingChecklist", group: "onboarding", label: "Checklist เริ่มงาน", titleFields: ["name", "code"], subtitleFields: ["code", "companyId"], searchFields: ["code", "name", "description"], restoreData: MASTER_RESTORE },
  { type: "onboarding-task", model: "OnboardingTask", delegate: "onboardingTask", group: "onboarding", label: "Task เริ่มงาน", titleFields: ["title", "category"], subtitleFields: ["employeeId", "status"], searchFields: ["title", "description", "category"] },
  { type: "onboarding-document", model: "OnboardingDocument", delegate: "onboardingDocument", group: "onboarding", label: "เอกสารเริ่มงาน", titleFields: ["documentName", "fileName"], subtitleFields: ["employeeId", "status"], searchFields: ["documentName", "description", "fileName", "note"] },
  { type: "probation-record", model: "ProbationRecord", delegate: "probationRecord", group: "onboarding", label: "ทดลองงาน", titleFields: ["summary", "result", "id"], subtitleFields: ["employeeId", "status"], searchFields: ["summary", "recommendation", "note", "result"] },

  { type: "report-job", model: "ReportJob", delegate: "reportJob", group: "report", label: "งานรายงาน", titleFields: ["name", "reportCode"], subtitleFields: ["status", "companyId"], searchFields: ["name", "description", "errorMessage", "cancelReason"] },
  { type: "export-file", model: "ExportFile", delegate: "exportFile", group: "report", label: "ไฟล์ Export", titleFields: ["title", "fileName"], subtitleFields: ["reportCode", "format"], searchFields: ["title", "description", "fileName"] },

  { type: "offsite-work-request", model: "OffsiteWorkRequest", delegate: "offsiteWorkRequest", group: "offsite", label: "คำขอทำงานนอกสถานที่", titleFields: ["requestNo", "locationName", "reason"], subtitleFields: ["employeeId", "status"], searchFields: ["requestNo", "locationName", "address", "reason"] },

  { type: "payroll-component", model: "PayrollComponent", delegate: "payrollComponent", group: "payroll", label: "รายการเงินเดือน", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["code", "type"], searchFields: ["code", "nameTh", "nameEn", "description"], restoreData: MASTER_RESTORE },
  { type: "employee-compensation", model: "EmployeeCompensation", delegate: "employeeCompensation", group: "payroll", label: "ฐานเงินเดือน", titleFields: ["employeeId", "id"], subtitleFields: ["companyId", "paymentMethod"], searchFields: ["bankName", "bankAccountName"], restoreData: MASTER_RESTORE },
  { type: "payroll-period", model: "PayrollPeriod", delegate: "payrollPeriod", group: "payroll", label: "งวดเงินเดือน", titleFields: ["name", "code"], subtitleFields: ["year", "month"], searchFields: ["code", "name"] },
  { type: "payroll-run", model: "PayrollRun", delegate: "payrollRun", group: "payroll", label: "Payroll Run", titleFields: ["name", "runNo"], subtitleFields: ["periodId", "status"], searchFields: ["runNo", "name"] },
  { type: "employee-compensation-item", model: "EmployeeCompensationItem", delegate: "employeeCompensationItem", group: "payroll", label: "รายรับ/รายหักประจำ", titleFields: ["name", "code"], subtitleFields: ["employeeId", "type"], searchFields: ["code", "name", "note"], restoreData: MASTER_RESTORE },
  { type: "payroll-adjustment", model: "PayrollAdjustment", delegate: "payrollAdjustment", group: "payroll", label: "รายการปรับปรุงเงินเดือน", titleFields: ["name", "code"], subtitleFields: ["employeeId", "status"], searchFields: ["code", "name", "note"] },

  { type: "payroll-tax-year", model: "PayrollTaxYear", delegate: "payrollTaxYear", group: "payroll-tax", label: "ปีภาษี", titleFields: ["name", "code", "taxYear"], subtitleFields: ["companyId", "taxYear"], searchFields: ["code", "name", "note"], restoreData: { status: "ACTIVE", isActive: true } },
  { type: "payroll-tax-bracket", model: "PayrollTaxBracket", delegate: "payrollTaxBracket", group: "payroll-tax", label: "ขั้นภาษี", titleFields: ["minIncome", "rate", "id"], subtitleFields: ["taxYearId", "maxIncome"], searchFields: ["note"] },
  { type: "payroll-tax-allowance-type", model: "PayrollTaxAllowanceType", delegate: "payrollTaxAllowanceType", group: "payroll-tax", label: "ประเภทค่าลดหย่อน", titleFields: ["nameTh", "nameEn", "code"], subtitleFields: ["category", "taxYearId"], searchFields: ["code", "nameTh", "nameEn", "description", "note"], restoreData: MASTER_RESTORE },
  { type: "employee-tax-profile", model: "EmployeeTaxProfile", delegate: "employeeTaxProfile", group: "payroll-tax", label: "ข้อมูลภาษีพนักงาน", titleFields: ["taxId", "employeeId"], subtitleFields: ["employeeId"], searchFields: ["taxId", "maritalStatus", "note"] },
  { type: "employee-tax-allowance", model: "EmployeeTaxAllowance", delegate: "employeeTaxAllowance", group: "payroll-tax", label: "ค่าลดหย่อนพนักงาน", titleFields: ["allowanceTypeId", "declaredAmount"], subtitleFields: ["taxProfileId", "status"], searchFields: ["note", "attachmentUrl"] },
];

const TRASH_MODEL_MAP = new Map(TRASH_MODELS.map((config) => [config.type, config]));

const TRASH_GROUP_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  organization: "องค์กร",
  employee: "พนักงาน",
  attendance: "ลงเวลา/วันหยุด",
  leave: "ลา",
  overtime: "OT",
  "time-adjust": "แก้เวลา",
  document: "เอกสาร",
  performance: "ประเมิน/วินัย",
  onboarding: "เริ่มงาน/ทดลองงาน",
  report: "รายงาน",
  offsite: "ทำงานนอกสถานที่",
  payroll: "เงินเดือน",
  "payroll-tax": "ภาษีเงินเดือน",
};

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function firstValue(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return formatValue(value);
    }
  }

  return null;
}

function formatValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null && "toString" in value) {
    return String(value);
  }

  return String(value);
}

function toDateRangeWhere(query: TrashQueryDto) {
  if (!query.dateFrom && !query.dateTo) return undefined;

  const where: Record<string, Date> = {};

  if (query.dateFrom) {
    where.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
  }

  if (query.dateTo) {
    where.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
  }

  return where;
}

function buildWhere(
  config: TrashModelConfig,
  query: TrashQueryDto,
  tenantWhere: Record<string, unknown>,
) {
  const deletedAtRange = toDateRangeWhere(query);
  const where: Record<string, unknown> = {
    deletedAt: deletedAtRange ?? { not: null },
    ...tenantWhere,
  };

  const q = query.q?.trim();
  const searchFields = config.searchFields ?? [];

  if (q && searchFields.length > 0) {
    where.OR = searchFields.map((field) => ({
      [field]: { contains: q, mode: "insensitive" },
    }));
  }

  return where;
}

function getPageMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

@Injectable()
export class TrashService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog() {
    return TRASH_MODELS.map((config) => ({
      type: config.type,
      label: config.label,
      group: config.group,
      groupLabel: TRASH_GROUP_LABELS[config.group] ?? config.group,
      model: config.model,
    }));
  }

  async getSummary(query: TrashQueryDto, scope: TenantScope) {
    const configs = this.filterConfigs(query).filter(
      (config) => tenantWhereForModel(config, scope) !== null,
    );
    const prisma = this.prisma as any;

    const counts = await Promise.all(
      configs.map(async (config) => {
        const delegate = prisma[config.delegate];
        const tenant = tenantWhereForModel(config, scope) ?? {};
        const count = await delegate.count({
          where: buildWhere(config, query, tenant),
        });

        return {
          type: config.type,
          label: config.label,
          group: config.group,
          groupLabel: TRASH_GROUP_LABELS[config.group] ?? config.group,
          model: config.model,
          count,
        };
      }),
    );

    const groups = Object.values(
      counts.reduce<Record<string, { group: string; label: string; count: number }>>(
        (acc, item) => {
          const current = acc[item.group] ?? {
            group: item.group,
            label: item.groupLabel,
            count: 0,
          };

          current.count += item.count;
          acc[item.group] = current;

          return acc;
        },
        {},
      ),
    ).sort((a, b) => b.count - a.count);

    return {
      total: counts.reduce((sum, item) => sum + item.count, 0),
      groups,
      types: counts.sort((a, b) => b.count - a.count),
      catalog: this.getCatalog(),
    };
  }

  async findItems(query: TrashQueryDto, scope: TenantScope) {
    const configs = this.filterConfigs(query).filter(
      (config) => tenantWhereForModel(config, scope) !== null,
    );
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100);
    const prisma = this.prisma as any;

    const summary = await this.getSummary(query, scope);
    const total = summary.total;
    const takePerType = Math.min(Math.max(page * pageSize, pageSize), 500);

    const itemsByType = await Promise.all(
      configs.map(async (config) => {
        const delegate = prisma[config.delegate];
        const tenant = tenantWhereForModel(config, scope) ?? {};
        const records = await delegate.findMany({
          where: buildWhere(config, query, tenant),
          orderBy: { deletedAt: "desc" },
          take: takePerType,
        });

        return records.map((record: Record<string, unknown>) => this.toTrashItem(config, record));
      }),
    );

    const items = itemsByType
      .flat()
      .sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    const start = (page - 1) * pageSize;
    const data = items.slice(start, start + pageSize);

    return {
      data,
      meta: getPageMeta(total, page, pageSize),
      summary,
    };
  }

  /**
   * ตรวจว่ารายการที่จะกู้คืน/ลบถาวร อยู่ในบริษัทของผู้เรียกจริง
   *
   * ต้องดึงซ้ำด้วย where ที่มีตัวกรอง tenant แทนการเช็คฟิลด์บน object ที่ดึงมาแล้ว
   * เพราะบางโมเดลผูกบริษัทผ่าน employee ไม่ใช่คอลัมน์ companyId ตรง ๆ
   */
  private async assertItemInScope(
    config: TrashModelConfig,
    id: string,
    scope: TenantScope,
  ) {
    if (scope.level === "GLOBAL") return;

    const tenant = tenantWhereForModel(config, scope);

    if (!tenant) {
      throw new ForbiddenException(
        `ประเภท "${config.label}" จัดการได้เฉพาะผู้ดูแลระดับแพลตฟอร์ม`,
      );
    }

    const found = await (this.prisma as any)[config.delegate].findFirst({
      where: { id, ...tenant },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException("ไม่พบรายการที่ถูกลบในถังขยะ");
    }
  }

  async restoreItem(type: string, id: string, scope: TenantScope) {
    const config = this.getConfig(type);
    const prisma = this.prisma as any;
    const delegate = prisma[config.delegate];
    const existing = await delegate.findUnique({ where: { id } });

    if (!existing || !existing.deletedAt) {
      throw new NotFoundException("ไม่พบรายการที่ถูกลบในถังขยะ");
    }

    await this.assertItemInScope(config, id, scope);

    const data: Record<string, unknown> = {
      deletedAt: null,
      ...(config.restoreData ?? {}),
    };

    if ("updatedAt" in existing) {
      data.updatedAt = new Date();
    }

    if ("deletedById" in existing) {
      data.deletedById = null;
    }

    try {
      const restored = await delegate.update({
        where: { id },
        data,
      });

      return {
        message: "กู้คืนรายการเรียบร้อยแล้ว",
        item: this.toTrashItem(config, { ...restored, deletedAt: existing.deletedAt }),
      };
    } catch (error) {
      this.handlePrismaWriteError(error, "กู้คืนไม่ได้");
    }
  }

  async permanentlyDeleteItem(type: string, id: string, scope: TenantScope) {
    const config = this.getConfig(type);
    const prisma = this.prisma as any;
    const delegate = prisma[config.delegate];
    const existing = await delegate.findUnique({ where: { id } });

    if (!existing || !existing.deletedAt) {
      throw new NotFoundException("ไม่พบรายการที่ถูกลบในถังขยะ");
    }

    await this.assertItemInScope(config, id, scope);

    try {
      await delegate.delete({ where: { id } });

      return {
        message: "ลบถาวรเรียบร้อยแล้ว",
        item: this.toTrashItem(config, existing),
      };
    } catch (error) {
      this.handlePrismaWriteError(
        error,
        "ลบถาวรไม่ได้ เพราะยังมีข้อมูลอื่นเชื่อมโยงอยู่",
      );
    }
  }

  private filterConfigs(query: TrashQueryDto) {
    if (query.type) {
      return [this.getConfig(query.type)];
    }

    if (query.group) {
      return TRASH_MODELS.filter((config) => config.group === query.group);
    }

    return TRASH_MODELS;
  }

  private getConfig(type: string) {
    const config = TRASH_MODEL_MAP.get(type);

    if (!config) {
      throw new BadRequestException("ไม่รองรับประเภทรายการถังขยะนี้");
    }

    return config;
  }

  private toTrashItem(config: TrashModelConfig, record: Record<string, unknown>): TrashItem {
    const title =
      this.buildEmployeeTitle(record) ??
      firstValue(record, config.titleFields) ??
      String(record.id);
    const subtitle = firstValue(record, config.subtitleFields ?? []);

    return {
      id: String(record.id),
      type: config.type,
      model: config.model,
      group: config.group,
      typeLabel: config.label,
      title,
      subtitle,
      code: record.code ? String(record.code) : null,
      status: record.status ? String(record.status) : null,
      deletedAt: record.deletedAt as Date,
      createdAt: (record.createdAt as Date | undefined) ?? null,
      updatedAt: (record.updatedAt as Date | undefined) ?? null,
      meta: this.buildMeta(config, record),
    };
  }

  private buildEmployeeTitle(record: Record<string, unknown>) {
    if (record.firstName || record.lastName) {
      const name = [record.firstName, record.lastName]
        .filter(Boolean)
        .map((value) => String(value))
        .join(" ")
        .trim();

      if (name) {
        return record.employeeCode ? `${name} (${record.employeeCode})` : name;
      }
    }

    return null;
  }

  private buildMeta(config: TrashModelConfig, record: Record<string, unknown>) {
    const fields = uniq([
      "companyId",
      "employeeId",
      "taxYear",
      "deletedById",
      ...(config.subtitleFields ?? []),
    ]);

    return Object.fromEntries(
      fields
        .filter((field) => record[field] !== undefined && record[field] !== null)
        .map((field) => [field, formatValue(record[field])]),
    );
  }

  private handlePrismaWriteError(error: unknown, fallbackMessage: string): never {
    const prismaError = error as { code?: string; meta?: { target?: unknown } };

    if (prismaError?.code === "P2002") {
      throw new BadRequestException(
        "กู้คืนไม่ได้ เพราะมีรายการ active ที่ใช้รหัสหรือข้อมูลเดียวกันอยู่แล้ว",
      );
    }

    if (prismaError?.code === "P2003" || prismaError?.code === "P2014") {
      throw new BadRequestException(fallbackMessage);
    }

    throw error;
  }
}
