import { IsOptional, IsString } from 'class-validator';

export class DocumentRequestActionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}