
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  EmployeeStatus,
  Gender,
  MaritalStatus,
} from '../../../generated/prisma/client';
import { EmailField } from '../../../common/decorators/email-field.decorator';

export class CreateEmployeeProfileDto {
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

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

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

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  /**
   * วันที่บรรจุเป็นพนักงานประจำ
   *
   * ใช้เป็นจุดตั้งต้นนับอายุงานของประเภทลาที่ตั้ง serviceStartBasis = PROBATION_PASS_DATE
   * (ลาพักร้อน ลาป่วย ลากิจไม่รับค่าจ้าง ลาคลอด) ถ้าเว้นว่างไว้ พนักงานจะยังไม่ได้สิทธิ์
   * ลาเหล่านี้เลย จำเป็นต้องกรอกตอนย้ายข้อมูลพนักงานเดิมเข้าระบบ
   */
  @IsOptional()
  @IsDateString()
  probationPassedAt?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsString()
  companyId!: string;

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
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmployeeProfileDto)
  profile?: CreateEmployeeProfileDto;
}