import { IsOptional, IsString } from 'class-validator';

export class OnboardingTaskActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}