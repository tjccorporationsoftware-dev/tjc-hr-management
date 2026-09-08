import { useEffect } from 'react';
import { AppState } from 'react-native';

import { requestPushPermissionOnce, syncPushRegistration } from './push';

/**
 * ทำให้เครื่องนี้พร้อมรับแจ้งเตือน โดยผู้ใช้ไม่ต้องเดินไปหาจอตั้งค่าเอง
 *
 * สองอย่างที่ต้องเกิดและเดิมไม่เกิดเลยสักอย่าง:
 *
 *   1. **ขอสิทธิ์** — Android ตั้งแต่ 13 ไม่ให้สิทธิ์แจ้งเตือนมาเองตอนติดตั้ง
 *      ต้องมีคนขอ แต่เดิมมีที่ขอที่เดียวคือปุ่มในจอตั้งค่าที่ต้องเดินไปกดเอง
 *   2. **ส่ง token ขึ้นเซิร์ฟเวอร์** — ปุ่มเดียวกันนั้นยังกดได้เฉพาะตอนสิทธิ์
 *      ยังเป็น UNDETERMINED คนที่เครื่องอนุญาตอยู่แล้วจึงไม่มี token บนเซิร์ฟเวอร์
 *      และ backend ก็เงียบไปเพราะหาเครื่องที่มี token ไม่เจอ
 *
 * เช็คซ้ำตอนกลับมาจากพื้นหลัง เพราะผู้ใช้ที่ออกไปเปิดสิทธิ์ในตั้งค่าเครื่อง
 * แล้วสลับกลับมา ต้องได้ลงทะเบียนทันทีโดยไม่ต้องปิดแอปเปิดใหม่
 */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    /*
     * ขอสิทธิ์ก่อน แล้วค่อยซิงก์ — สองตัวนี้ห้ามยิงพร้อมกัน เพราะต่างก็ขอ
     * token จาก Expo คนละครั้งแล้วยิง PATCH ซ้อนกันโดยไม่ได้อะไรเพิ่ม
     * (ตัวขอสิทธิ์ลงทะเบียน token ให้ในตัวอยู่แล้วเมื่อผู้ใช้กดอนุญาต)
     */
    const run = async () => {
      await requestPushPermissionOnce();
      await syncPushRegistration();
    };

    void run();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPushRegistration();
      }
    });

    return () => subscription.remove();
  }, [enabled]);
}
