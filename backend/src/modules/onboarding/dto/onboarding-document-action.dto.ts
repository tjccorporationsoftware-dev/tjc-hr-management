import { IsOptional, IsString } from 'class-validator';

export class OnboardingDocumentActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}