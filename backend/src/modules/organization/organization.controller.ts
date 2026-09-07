import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type {
  AuthenticatedUser,
  TenantScope,
} from "../../common/interfaces/authenticated-user.interface";
import {
  ApprovalMatrixTargetType,
  AuditAction,
  MasterStatus,
} from "../../generated/prisma/client";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";
import { CreateCompanyDto, UpdateCompanyDto } from "./dto/company.dto";
import { CreatePositionDto, UpdatePositionDto } from "./dto/position.dto";
import {
  CreateApprovalMatrixDto,
  UpdateApprovalMatrixDto,
} from "./dto/approval-matrix.dto";

import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from "./dto/department.dto";
import { CreateDivisionDto, UpdateDivisionDto } from "./dto/division.dto";
import {
  CreateEmployeeTypeDto,
  UpdateEmployeeTypeDto,
} from "./dto/employee-type.dto";
import { OrganizationService } from "./organization.service";
import {
  companyLogoFileFilter,
  COMPANY_LOGO_MAX_FILE_SIZE,
  COMPANY_LOGO_UPLOAD_DIR,
  createCompanyLogoFileName,
  ensureCompanyLogoStorageDir,
} from "./company-logo-storage.util";
import {
  branchLogoFileFilter,
  BRANCH_LOGO_MAX_FILE_SIZE,
  BRANCH_LOGO_UPLOAD_DIR,
  createBranchLogoFileName,
  ensureBranchLogoStorageDir,
} from "./branch-logo-storage.util";

@Controller("organization")
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * บังคับ tenant scope ที่ชั้น controller:
   * GLOBAL  -> ใช้ค่าที่ client ส่งมาได้ตามปกติ
   * COMPANY -> ล็อก companyId = บริษัทของผู้ใช้ (เมินค่าที่ client ส่ง)
   * BRANCH  -> ล็อก companyId + branchId = ของผู้ใช้
   * ใช้ sentinel เมื่อ scope ไม่มี company/branch เพื่อให้ query ไม่คืนข้อมูล (fail-safe)
   */
  private scopeFilter(
    scope: TenantScope,
    companyId?: string,
    branchId?: string,
  ): { companyId?: string; branchId?: string } {
    if (scope.level === "GLOBAL") {
      return { companyId, branchId };
    }

    return {
      companyId: scope.companyId ?? "__no_company__",
      branchId:
        scope.level === "BRANCH"
          ? (scope.branchId ?? "__no_branch__")
          : branchId,
    };
  }

  /**
   * คืน companyId ที่จะใช้สร้างข้อมูล master รายบริษัท:
   * GLOBAL -> ต้องระบุ companyId มาใน dto; COMPANY/BRANCH -> ล็อกเป็นบริษัทของผู้ใช้
   */
  private requireCompanyId(scope: TenantScope, dtoCompanyId?: string): string {
    const companyId =
      scope.level === "GLOBAL" ? dtoCompanyId : scope.companyId;
    if (!companyId) {
      throw new BadRequestException("กรุณาระบุบริษัทของข้อมูลนี้");
    }
    return companyId;
  }


  @Get("summary")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "OrganizationSummary",
    description: "View organization summary",
  })
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.getSummary({
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      departmentId,
    });
  }

  /**
   * ผังองค์กรแบบอ่านอย่างเดียว
   * ใช้ ORG_READ ตัวเดียว ไม่ต้องมี EMPLOYEE_READ เพราะไม่คืนข้อมูลอ่อนไหวของพนักงาน
   * (ดูเหตุผลเต็มที่ organization.service.getOrgChart)
   */
  @Get("org-chart")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "OrganizationOrgChart",
    description: "ดูผังองค์กรแบบอ่านอย่างเดียว",
  })
  async getOrgChart(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.getOrgChart({
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      departmentId,
    });
  }

  @Get("structure-summary")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "OrganizationStructureSummary",
    description: "View organization structure summary",
  })
  async getStructureSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("q") q?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.getStructureSummary({
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      departmentId,
      q,
    });
  }

  /**
   * =========================
   * Companies
   * =========================
   */

  @Get("companies")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Company",
    description: "View company list",
  })
  async findCompanies(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId);
    return this.organizationService.findCompanies({
      q,
      companyId: scoped.companyId,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("companies/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Company",
    description: "View company detail",
  })
  async findCompanyById(@Param("id") id: string) {
    return this.organizationService.findCompanyById(id);
  }

  @Post("companies")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Company",
    description: "Create company",
  })
  async createCompany(@Body() dto: CreateCompanyDto) {
    return this.organizationService.createCompany(dto);
  }

  @Patch("companies/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Company",
    description: "Update company",
  })
  async updateCompany(
    @Param("id") id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.organizationService.updateCompany(id, dto);
  }

  @Post("companies/:id/logo")
  @Auth("ORG_MANAGE")
  @UseInterceptors(
    FileInterceptor("logo", {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureCompanyLogoStorageDir();
          callback(null, COMPANY_LOGO_UPLOAD_DIR);
        },
        filename: (request, file, callback) => {
          const rawCompanyId = request.params?.id;
          const companyId = Array.isArray(rawCompanyId)
            ? rawCompanyId[0]
            : rawCompanyId;

          callback(null, createCompanyLogoFileName(companyId ?? "company", file));
        },
      }),
      fileFilter: companyLogoFileFilter,
      limits: {
        fileSize: COMPANY_LOGO_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: "CompanyLogo",
    description: "Upload company logo",
  })
  async uploadCompanyLogo(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.organizationService.uploadCompanyLogo(id, file);
  }

  @Delete("companies/:id/logo")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "CompanyLogo",
    description: "Delete company logo",
  })
  async deleteCompanyLogo(@Param("id") id: string) {
    return this.organizationService.deleteCompanyLogo(id);
  }

  @Delete("companies/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Company",
    description: "Soft delete company",
  })
  async deleteCompany(@Param("id") id: string) {
    return this.organizationService.deleteCompany(id);
  }

  /**
   * =========================
   * Branches
   * =========================
   */

  @Get("branches")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Branch",
    description: "View branch list",
  })
  async findBranches(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId);
    return this.organizationService.findBranches({
      q,
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("branches/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Branch",
    description: "View branch detail",
  })
  async findBranchById(@Param("id") id: string) {
    return this.organizationService.findBranchById(id);
  }

  @Post("branches")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Branch",
    description: "Create branch",
  })
  async createBranch(@Body() dto: CreateBranchDto) {
    return this.organizationService.createBranch(dto);
  }

  @Patch("branches/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Branch",
    description: "Update branch",
  })
  async updateBranch(@Param("id") id: string, @Body() dto: UpdateBranchDto) {
    return this.organizationService.updateBranch(id, dto);
  }

  @Post("branches/:id/logo")
  @Auth("ORG_MANAGE")
  @UseInterceptors(
    FileInterceptor("logo", {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          ensureBranchLogoStorageDir();
          callback(null, BRANCH_LOGO_UPLOAD_DIR);
        },
        filename: (request, file, callback) => {
          const rawBranchId = request.params?.id;
          const branchId = Array.isArray(rawBranchId)
            ? rawBranchId[0]
            : rawBranchId;

          callback(null, createBranchLogoFileName(branchId ?? "branch", file));
        },
      }),
      fileFilter: branchLogoFileFilter,
      limits: {
        fileSize: BRANCH_LOGO_MAX_FILE_SIZE,
      },
    }),
  )
  @Audit({
    action: AuditAction.UPLOAD,
    entity: "BranchLogo",
    description: "Upload branch logo",
  })
  async uploadBranchLogo(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.organizationService.uploadBranchLogo(id, file);
  }

  @Delete("branches/:id/logo")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "BranchLogo",
    description: "Delete branch logo",
  })
  async deleteBranchLogo(@Param("id") id: string) {
    return this.organizationService.deleteBranchLogo(id);
  }

  @Delete("branches/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Branch",
    description: "Soft delete branch",
  })
  async deleteBranch(@Param("id") id: string) {
    return this.organizationService.deleteBranch(id);
  }

  /**
   * =========================
   * Departments
   * =========================
   */

  @Get("departments")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Department",
    description: "View department list",
  })
  async findDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.findDepartments({
      q,
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("departments/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Department",
    description: "View department detail",
  })
  async findDepartmentById(@Param("id") id: string) {
    return this.organizationService.findDepartmentById(id);
  }

  @Post("departments")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Department",
    description: "Create department",
  })
  async createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const companyId = this.requireCompanyId(user.scope, dto.companyId);
    return this.organizationService.createDepartment(dto, companyId);
  }

  @Patch("departments/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Department",
    description: "Update department",
  })
  async updateDepartment(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.organizationService.updateDepartment(id, dto);
  }

  @Delete("departments/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Department",
    description: "Soft delete department",
  })
  async deleteDepartment(@Param("id") id: string) {
    return this.organizationService.deleteDepartment(id);
  }

  /**
   * =========================
   * Divisions
   * =========================
   */

@Get("divisions")
@Auth("ORG_READ")
@Audit({
  action: AuditAction.VIEW,
  entity: "Division",
  description: "View division list",
})
async findDivisions(
  @CurrentUser() user: AuthenticatedUser,
  @Query("q") q?: string,
  @Query("companyId") companyId?: string,
  @Query("branchId") branchId?: string,
  @Query("departmentId") departmentId?: string,
  @Query("status") status?: MasterStatus,
  @Query("page") page?: string,
  @Query("pageSize") pageSize?: string,
) {
  const scoped = this.scopeFilter(user.scope, companyId, branchId);
  return this.organizationService.findDivisions({
    q,
    companyId: scoped.companyId,
    branchId: scoped.branchId,
    departmentId,
    status,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
  });
}

  @Get("divisions/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Division",
    description: "View division detail",
  })
  async findDivisionById(@Param("id") id: string) {
    return this.organizationService.findDivisionById(id);
  }

  @Post("divisions")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Division",
    description: "Create division",
  })
  async createDivision(
    @Body() dto: CreateDivisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // GLOBAL: อนุมานบริษัทจากแผนก; company/branch: ล็อกบริษัทของผู้ใช้
    const companyId =
      user.scope.level === "GLOBAL"
        ? undefined
        : (user.scope.companyId ?? "__no_company__");
    return this.organizationService.createDivision(dto, companyId);
  }

  @Patch("divisions/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Division",
    description: "Update division",
  })
  async updateDivision(
    @Param("id") id: string,
    @Body() dto: UpdateDivisionDto,
  ) {
    return this.organizationService.updateDivision(id, dto);
  }

  @Delete("divisions/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Division",
    description: "Soft delete division",
  })
  async deleteDivision(@Param("id") id: string) {
    return this.organizationService.deleteDivision(id);
  }

  @Get("positions")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Position",
    description: "View position list",
  })
  async findPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.findPositions({
      q,
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      departmentId,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("positions/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "Position",
    description: "View position detail",
  })
  async findPositionById(@Param("id") id: string) {
    return this.organizationService.findPositionById(id);
  }

  @Post("positions")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "Position",
    description: "Create position",
  })
  async createPosition(
    @Body() dto: CreatePositionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const companyId = this.requireCompanyId(user.scope, dto.companyId);
    return this.organizationService.createPosition(dto, companyId);
  }

  @Patch("positions/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "Position",
    description: "Update position",
  })
  async updatePosition(
    @Param("id") id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.organizationService.updatePosition(id, dto);
  }

  @Delete("positions/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "Position",
    description: "Soft delete position",
  })
  async deletePosition(@Param("id") id: string) {
    return this.organizationService.deletePosition(id);
  }


  /**
   * =========================
   * Approval Matrices
   * =========================
   */

  @Get("approval-matrices")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "ApprovalMatrix",
    description: "View approval matrix list",
  })
  async findApprovalMatrices(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("employeeTypeId") employeeTypeId?: string,
    @Query("targetType") targetType?: ApprovalMatrixTargetType,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId);
    return this.organizationService.findApprovalMatrices({
      q,
      companyId: scoped.companyId,
      // branchId เป็นตัวกรองแสดงผล (ผู้ใช้เลือกเอง) ไม่ใช่กำแพง scope —
      // สายอนุมัติเป็น config ระดับบริษัท ผู้ดูแลสาขาจึงยังเห็นสายระดับบริษัท (branchId = null) ได้
      branchId,
      departmentId,
      employeeTypeId,
      targetType,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("approval-matrices/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "ApprovalMatrix",
    description: "View approval matrix detail",
  })
  async findApprovalMatrixById(@Param("id") id: string) {
    return this.organizationService.findApprovalMatrixById(id);
  }

  @Post("approval-matrices")
  @Auth("APPROVAL_MATRIX_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "ApprovalMatrix",
    description: "Create approval matrix",
  })
  async createApprovalMatrix(
    @Body() dto: CreateApprovalMatrixDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.createApprovalMatrix(dto, user.scope);
  }

  @Patch("approval-matrices/:id")
  @Auth("APPROVAL_MATRIX_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalMatrix",
    description: "Update approval matrix",
  })
  async updateApprovalMatrix(
    @Param("id") id: string,
    @Body() dto: UpdateApprovalMatrixDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.updateApprovalMatrix(id, dto, user.scope);
  }

  @Delete("approval-matrices/:id")
  @Auth("APPROVAL_MATRIX_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "ApprovalMatrix",
    description: "Soft delete approval matrix",
  })
  async deleteApprovalMatrix(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.deleteApprovalMatrix(id, user.scope);
  }

  /**
   * =========================
   * Employee Types
   * =========================
   */

  @Get("employee-types")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "EmployeeType",
    description: "View employee type list",
  })
  async findEmployeeTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q?: string,
    @Query("companyId") companyId?: string,
    @Query("branchId") branchId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: MasterStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const scoped = this.scopeFilter(user.scope, companyId, branchId);
    return this.organizationService.findEmployeeTypes({
      q,
      companyId: scoped.companyId,
      branchId: scoped.branchId,
      departmentId,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("employee-types/:id")
  @Auth("ORG_READ")
  @Audit({
    action: AuditAction.VIEW,
    entity: "EmployeeType",
    description: "View employee type detail",
  })
  async findEmployeeTypeById(@Param("id") id: string) {
    return this.organizationService.findEmployeeTypeById(id);
  }

  @Post("employee-types")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.CREATE,
    entity: "EmployeeType",
    description: "Create employee type",
  })
  async createEmployeeType(
    @Body() dto: CreateEmployeeTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const companyId = this.requireCompanyId(user.scope, dto.companyId);
    return this.organizationService.createEmployeeType(dto, companyId);
  }

  @Patch("employee-types/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "EmployeeType",
    description: "Update employee type",
  })
  async updateEmployeeType(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeTypeDto,
  ) {
    return this.organizationService.updateEmployeeType(id, dto);
  }

  @Delete("employee-types/:id")
  @Auth("ORG_MANAGE")
  @Audit({
    action: AuditAction.DELETE,
    entity: "EmployeeType",
    description: "Soft delete employee type",
  })
  async deleteEmployeeType(@Param("id") id: string) {
    return this.organizationService.deleteEmployeeType(id);
  }
}