import { SetMetadata } from "@nestjs/common";

export const ALLOW_WHEN_PASSWORD_EXPIRED_KEY = "allowWhenPasswordExpired";

/**
 * ยกเว้นจากการบังคับเปลี่ยนรหัสผ่าน
 * ================================
 * บัญชีที่ผู้ดูแลตั้ง/รีเซ็ตรหัสให้จะถูกบังคับให้เปลี่ยนรหัสก่อนใช้งานระบบ
 * แต่ต้องเหลือทางให้เขาทำสิ่งนั้นได้ — อย่างน้อยคือดูข้อมูลตัวเอง
 * เปลี่ยนรหัสผ่าน และออกจากระบบ
 *
 * ถ้าไม่มีตัวยกเว้นนี้ บัญชีจะล็อกตัวเองจนใช้งานไม่ได้เลย
 */
export const AllowWhenPasswordExpired = () =>
  SetMetadata(ALLOW_WHEN_PASSWORD_EXPIRED_KEY, true);
