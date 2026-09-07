import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_METADATA_KEY = "rate_limit:options";

export type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
  includeEmail?: boolean;
  includeUserId?: boolean;
  /**
   * แยกโควตาตาม token 2FA ที่ออกให้แต่ละครั้ง
   *
   * ขั้นยืนยัน 2FA ยังไม่มี user ใน request และ body ก็ไม่มีอีเมล ถ้านับตาม IP
   * อย่างเดียว ทุกคนที่ออกเน็ตไอพีเดียวกันจะใช้โควตาก้อนเดียวกัน
   */
  includeTwoFactorToken?: boolean;
  includePath?: boolean;
  message?: string;
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);