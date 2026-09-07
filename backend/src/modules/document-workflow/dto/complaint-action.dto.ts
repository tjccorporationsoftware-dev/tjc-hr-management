import { IsOptional, IsString } from 'class-validator';

export class ComplaintActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}