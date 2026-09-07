import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class AuditCriticalActionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 7))
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number = 7;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
