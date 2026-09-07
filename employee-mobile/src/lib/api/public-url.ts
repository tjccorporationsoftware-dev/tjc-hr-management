import { getAppConfig } from '@/config/app-config';

/**
 * ที่อยู่ของไฟล์สาธารณะ (รูปโปรไฟล์ โลโก้บริษัท)
 *
 * ## กับดักที่เคยทำให้รูปไม่ขึ้นทั้งแอป
 *
 * ไฟล์พวกนี้ backend เสิร์ฟไว้ที่ **ราก** ไม่ได้อยู่ใต้ `/api`
 * (`app.useStaticAssets(..., { prefix: '/uploads/avatars/' })` ใน main.ts)
 * แต่ `apiBaseUrl` ของแอปคือ `http://host:4000/api` — ถ้าเอาสองอย่างมาต่อกันตรง ๆ
 * จะได้ `/api/uploads/avatars/x.jpg` ซึ่ง 404 เสมอ
 *
 * และเพราะเป็นการโหลดรูป มันจึงไม่โยน error ให้เห็น แค่ตกไปใช้ตัวสำรองเงียบ ๆ
 * (อักษรย่อ) ทำให้ดูเหมือน "ระบบไม่มีรูป" ทั้งที่รูปอยู่ครบ — จึงต้องตัดให้เหลือ
 * แค่ origin ก่อนเสมอ กติกาเดียวกับ getPublicFileUrl ของฝั่งเว็บ
 */
export function toPublicFileUrl(
  apiBaseUrl: string,
  path?: string | null,
): string | null {
  if (!path) {
    return null;
  }

  /* ที่อยู่เต็มหรือรูปฝังในตัวเอง ใช้ได้ทันที ห้ามเอา origin ไปต่อหัว */
  if (/^(https?:\/\/|data:|blob:)/i.test(path)) {
    return path;
  }

  const origin = apiBaseUrl.replace(/^(https?:\/\/[^/]+).*$/i, '$1');

  return `${origin}/${path.replace(/^\/+/, '')}`;
}

export function publicFileUrl(path?: string | null): string | null {
  return toPublicFileUrl(getAppConfig().apiBaseUrl, path);
}
