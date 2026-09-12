import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import {
  AttendanceMethod,
  EmployeeStatus,
  Gender,
  MaritalStatus,
} from '../../../generated/prisma/client';
import { EmailField } from '../../../common/decorators/email-field.decorator';
import {
  EMPLOYEE_CODE_MAX_LENGTH,
  EMPLOYEE_CODE_PATTERN,
  EMPLOYEE_CODE_RULE_MESSAGE,
} from '../utils/employee-code.util';

export class UpdateEmployeeProfileDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNo?: string;

  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  religion?: string;

  @IsOptional()
  @IsString()
  currentAddress?: string;

  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelation?: string;

  /* ผู้ติดต่อฉุกเฉินคนที่สอง — ชุดเดียวกับคนแรกทุกช่อง */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContactName2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactPhone2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelation2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  educationLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  educationInstitute?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  educationMajor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastNameEn?: string;

  @IsOptional()
  @EmailField()
  @MaxLength(200)
  personalEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  workPhoneExt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lineId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  socialSecurityNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialSecurityHospital?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  providentFundNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payrollPaymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractNo?: string;

  @IsOptional()
  @IsDateString()
  contractStartDate?: string;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workPermitNo?: string;

  @IsOptional()
  @IsDateString()
  workPermitExpiredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  visaNo?: string;

  @IsOptional()
  @IsDateString()
  visaExpiredDate?: string;

  @IsOptional()
  @IsString()
  emergencyContactAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactAddress2?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateEmployeeDto {
  /** กติการหัสพนักงาน (อักษรอังกฤษ/ตัวเลขเท่านั้น) ดู employee-code.util.ts */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(EMPLOYEE_CODE_MAX_LENGTH)
  @Matches(EMPLOYEE_CODE_PATTERN, { message: EMPLOYEE_CODE_RULE_MESSAGE })
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @EmailField()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  /**
   * วันที่บรรจุเป็นพนักงานประจำ — ดูคำอธิบายเต็มที่ CreateEmployeeDto
   * ส่งค่าว่างเพื่อล้างค่า (กลับไปเป็นยังไม่บรรจุ)
   */
  @IsOptional()
  @IsDateString()
  probationPassedAt?: string | null;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  employeeTypeId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(AttendanceMethod, { each: true })
  allowedAttendanceMethods?: AttendanceMethod[];

  @IsOptional()
  @IsBoolean()
  attendanceGeofenceRequired?: boolean;

  /** จุดลงเวลา GPS ที่ผูกรายคน — ส่ง null เพื่อกลับไปใช้จุดของสาขา */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  attendanceLocationId?: string | null;

  @IsOptional()
  @IsString()
  supervisorId?: string;

  /** ลำดับที่จัดไว้เองในกระดานผังองค์กร — 0 = ปล่อยให้เรียงตามระดับตำแหน่ง */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEmployeeProfileDto)
  profile?: UpdateEmployeeProfileDto;
}
