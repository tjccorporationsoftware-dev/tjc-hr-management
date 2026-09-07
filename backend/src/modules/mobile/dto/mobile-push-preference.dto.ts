import { IsBoolean, IsIn, IsString } from 'class-validator';

import { MOBILE_PUSH_CATEGORIES } from '../application/mobile-push-preference.service';

/**
 * เปิด/ปิดแจ้งเตือนเข้ามือถือหนึ่งหมวด
 *
 * รับทีละหมวดโดยตั้งใจ ไม่รับทั้งชุด — ผู้ใช้แตะสวิตช์ทีละตัว การส่งทั้งชุด
 * ทุกครั้งแปลว่าถ้าสองเครื่องแตะพร้อมกัน เครื่องที่ตอบทีหลังจะเขียนทับค่าของ
 * อีกเครื่องที่ผู้ใช้เพิ่งตั้งไป
 */
export class MobileUpdatePushPreferenceDto {
  @IsString()
  @IsIn([...MOBILE_PUSH_CATEGORIES])
  category!: string;

  @IsBoolean()
  enabled!: boolean;
}
