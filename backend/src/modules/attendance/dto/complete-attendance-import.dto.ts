import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class AttendanceImportImpactRowDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @IsString()
  attendanceLogId?: string;
}

export class CompleteAttendanceImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceImportImpactRowDto)
  rows!: AttendanceImportImpactRowDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  totalRows?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  importedRows?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  errorRows?: number;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
