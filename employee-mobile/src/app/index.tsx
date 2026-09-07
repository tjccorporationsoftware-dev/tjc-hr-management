import { Redirect } from 'expo-router';

import { AppLoading } from '@/components/feedback/app-loading';
import { useAuthStore } from '@/features/auth/auth.store';

/**
 * MOB-001 — App launch gate
 *
 * ตัดสินปลายทางจากสถานะ session อย่างเดียว
 * ส่วนที่ต้องใช้ข้อมูลจาก bootstrap (บังคับอัปเดต / บัญชียังไม่ผูกพนักงาน)
 * ไปตัดสินใน (app)/_layout.tsx เพราะต้องมี session ก่อนถึงจะเรียก bootstrap ได้
 *
 * ลำดับด่านหลังมี session แล้ว:
 *   เปลี่ยนรหัสชั่วคราว → ตั้ง PIN (ถ้ายังไม่เคยตั้ง) → ใส่ PIN → เข้าแอป
 */
export default function IndexScreen() {
  const hasPin = useAuthStore((state) => state.hasPin);
  const locked = useAuthStore((state) => state.locked);
  const mustChangePassword = useAuthStore(
    (state) => state.user?.mustChangePassword ?? false,
  );
  const status = useAuthStore((state) => state.status);

  if (status === 'restoring') {
    return <AppLoading message="กำลังตรวจสอบเซสชัน..." />;
  }

  if (status === 'two-factor-required') {
    return <Redirect href="/verify-2fa" />;
  }

  if (status === 'authenticated') {
    /*
     * รหัสชั่วคราวที่ HR ตั้งให้ต้องถูกเปลี่ยนก่อนทุกอย่าง รวมถึงก่อนตั้ง PIN
     * — ไม่งั้นจะได้ PIN ที่เปิดเข้าบัญชีซึ่งรหัสผ่านยังเป็นของที่ส่งต่อกันมาทางแชท
     */
    if (mustChangePassword) {
      return <Redirect href="/change-password" />;
    }

    /*
     * null = ยังอ่านไม่เสร็จว่าเครื่องนี้มี PIN ไหม ต้องรอ ห้ามเดา
     * ถ้าเดาว่า "ไม่มี" จะเด้งไปหน้าตั้ง PIN ทับคนที่ตั้งไว้แล้วทุกครั้งที่เปิดแอป
     */
    if (hasPin === null) {
      return <AppLoading message="กำลังเตรียมพื้นที่ทำงาน..." />;
    }

    if (!hasPin) {
      return <Redirect href="/set-pin" />;
    }

    if (locked) {
      return <Redirect href="/unlock" />;
    }

    return <Redirect href="/today" />;
  }

  return <Redirect href="/login" />;
}
