import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadTimeAdjustAttachmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}