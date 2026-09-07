import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadOvertimeAttachmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}