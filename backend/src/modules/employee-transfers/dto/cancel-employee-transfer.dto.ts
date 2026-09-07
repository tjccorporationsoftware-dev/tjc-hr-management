import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEmployeeTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;
}
