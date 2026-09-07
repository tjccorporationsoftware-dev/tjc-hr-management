import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  ApprovalStepApproverType,
  MasterStatus,
} from "../../../generated/prisma/client";
import {
  SUPPORTED_APPROVAL_TARGET_TYPES,
  UNSUPPORTED_TARGET_TYPE_MESSAGE,
  type SupportedApprovalTargetType,
} from "../../approval-workflow/utils/supported-target-types.util";

export class CreateApprovalMatrixStepDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepNo!: number;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ApprovalStepApproverType, {
    message: "ประเภทผู้อนุมัติไม่ถูกต้อง",
  })
  approverType!: ApprovalStepApproverType;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleCode?: string;

  /**
   * ผู้อนุมัติแทน เมื่อผู้อนุมัติหลักกลายเป็นคนยื่นเอง
   * เช่นขั้นนี้ตั้งเป็น "หัวหน้าโดยตรง" แล้วหัวหน้ายื่นใบลาของตัวเอง
   */
  @IsOptional()
  @IsEnum(ApprovalStepApproverType, {
    message: "ประเภทผู้อนุมัติแทนไม่ถูกต้อง",
  })
  fallbackApproverType?: ApprovalStepApproverType;

  @IsOptional()
  @IsString()
  fallbackPositionId?: string;

  @IsOptional()
  @IsString()
  fallbackEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fallbackRoleCode?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireAll?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minApproverCount?: number;
}

export class CreateApprovalMatrixDto {
  @IsString()
  companyId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  nameTh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /*
   * รับเฉพาะประเภทที่ต่อสายอนุมัติไว้จริง
   * ประเภทที่เหลือใน enum ตั้งได้แต่ไม่มีผลใด ๆ ซึ่งอันตรายกว่าไม่มีให้ตั้ง
   */
  @IsIn([...SUPPORTED_APPROVAL_TARGET_TYPES], {
    message: UNSUPPORTED_TARGET_TYPE_MESSAGE,
  })
  targetType!: SupportedApprovalTargetType;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterEmployeeIds?: string[];

  /** สาขาเพิ่มเติมที่ใช้สายเดียวกัน (นอกเหนือจาก branchId ซึ่งเป็นสาขาแรก) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateApprovalMatrixStepDto)
  steps?: CreateApprovalMatrixStepDto[];
}

export class UpdateApprovalMatrixStepDto extends CreateApprovalMatrixStepDto {}

export class UpdateApprovalMatrixDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn([...SUPPORTED_APPROVAL_TARGET_TYPES], {
    message: UNSUPPORTED_TARGET_TYPE_MESSAGE,
  })
  targetType?: SupportedApprovalTargetType;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterEmployeeIds?: string[];

  /** สาขาเพิ่มเติมที่ใช้สายเดียวกัน (นอกเหนือจาก branchId ซึ่งเป็นสาขาแรก) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(MasterStatus, { message: "สถานะไม่ถูกต้อง" })
  status?: MasterStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateApprovalMatrixStepDto)
  steps?: UpdateApprovalMatrixStepDto[];
}
