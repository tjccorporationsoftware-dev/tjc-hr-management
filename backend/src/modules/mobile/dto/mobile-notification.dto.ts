import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const MOBILE_NOTIFICATION_STATUSES = ['ALL', 'UNREAD', 'READ'] as const;
export type MobileNotificationStatus = (typeof MOBILE_NOTIFICATION_STATUSES)[number];

export const MOBILE_NOTIFICATION_CATEGORIES = [
  'ALL',
  'REQUEST',
  'DOCUMENT',
  'ATTENDANCE',
  'HR',
  'OTHER',
] as const;
export type MobileNotificationCategory =
  (typeof MOBILE_NOTIFICATION_CATEGORIES)[number];

export class MobileNotificationListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(5)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn([...MOBILE_NOTIFICATION_STATUSES])
  status?: MobileNotificationStatus;

  @IsOptional()
  @Transform(({ value }) => String(value).toUpperCase())
  @IsIn([...MOBILE_NOTIFICATION_CATEGORIES])
  category?: MobileNotificationCategory;
}
