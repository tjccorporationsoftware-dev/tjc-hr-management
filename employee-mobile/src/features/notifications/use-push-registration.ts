import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncPushRegistration } from './push';

/**
 * ลงทะเบียน push token ของเครื่องนี้ทุกครั้งที่เข้าใช้งาน
 *
 * เดิมมีทางเดียวคือปุ่มในจอตั้งค่า ซึ่งกดได้เฉพาะตอนสิทธิ์ยังเป็น UNDETERMINED
 * คนที่เครื่องอนุญาตแจ้งเตือนอยู่แล้วจึงไม่เคยมี token บนเซิร์ฟเวอร์ และ backend
 * ก็เงียบไปเฉย ๆ เพราะหาเครื่องที่มี token ไม่เจอ
 *
 * เช็คซ้ำตอนกลับมาจากพื้นหลังด้วย เพราะผู้ใช้ที่ออกไปเปิดสิทธิ์ในตั้งค่าเครื่อง
 * แล้วสลับกลับมา ต้องได้ลงทะเบียนทันทีโดยไม่ต้องปิดแอปเปิดใหม่
 */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    void syncPushRegistration();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPushRegistration();
      }
    });

    return () => subscription.remove();
  }, [enabled]);
}
