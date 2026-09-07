import Ionicons from '@expo/vector-icons/Ionicons';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import { Text } from '@/design/text';
import { useAuthStore } from '@/features/auth/auth.store';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * กันข้อมูลสำคัญรั่วออกนอกจอ
 *
 * ป้องกันสองทางที่ต่างกันโดยสิ้นเชิง อย่าสับสน:
 *
 * ## 1. ภาพตัวอย่างใน app switcher (`PrivacyOverlay`)
 *
 * เวลาสลับแอป ระบบถ่ายภาพหน้าจอล่าสุดไปแสดงในรายการแอปที่เปิดอยู่ ถ้าตอนนั้น
 * เปิดสลิปเงินเดือนค้างไว้ ยอดเงินจะโผล่ให้คนที่หยิบเครื่องไปเห็นทันทีโดยไม่
 * ต้องปลดล็อกอะไรเลย
 *
 * แก้ด้วยการวางแผ่นทึบทับทั้งจอ**ตั้งแต่ตอนที่สถานะยังเป็น `inactive`** ซึ่ง
 * เกิดก่อนที่ระบบจะถ่ายภาพ — ถ้ารอถึง `background` จะช้าไปหนึ่งจังหวะและได้
 * ภาพจริงติดไปแล้ว (iOS ยิง inactive ก่อนเสมอ ส่วน Android ยิงตอน pause)
 *
 * ## 2. การถ่ายภาพหน้าจอโดยตรง (`useScreenCaptureGuard`)
 *
 * Android บล็อกได้จริงด้วย FLAG_SECURE ส่วน iOS บล็อกไม่ได้เลยในทางเทคนิค
 * (ทำได้แค่รู้ทีหลังว่าถูกถ่าย) จึงใช้เฉพาะกับจอที่มีข้อมูลการเงินจริง ๆ
 * ไม่เปิดทั้งแอป เพราะจะทำให้ผู้ใช้แชร์ภาพตารางกะให้เพื่อนร่วมงานไม่ได้
 * ซึ่งเป็นการใช้งานปกติที่ไม่ได้อันตราย
 */

/**
 * เปิดโหมดกันถ่ายภาพหน้าจอตลอดอายุของจอที่เรียก
 *
 * ใช้กับจอที่มีเงินเดือน ภาษี หรือเลขบัญชีธนาคารเท่านั้น
 */
export function useScreenCaptureGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let released = false;

    void ScreenCapture.preventScreenCaptureAsync().catch(() => {
      /* เครื่องที่ทำไม่ได้ไม่ควรทำให้จอพัง — ยังมีแผ่นทับตอนสลับแอปคุมอยู่ */
    });

    return () => {
      if (released) return;
      released = true;
      void ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, [enabled]);
}

/**
 * แผ่นทับตอนแอปออกจากหน้าจอ
 *
 * วางไว้ที่ระดับบนสุดของแอปครั้งเดียว ไม่ต้องใส่รายจอ
 *
 * แสดงเฉพาะตอนล็อกอินแล้ว — หน้าล็อกอินไม่มีอะไรต้องปิด และการเห็นแผ่นทับ
 * ตอนยังไม่ได้เข้าระบบจะดูเหมือนแอปค้าง
 */
export function PrivacyOverlay() {
  const { theme } = useAppTheme();
  /*
   * อ่านสถานะจาก store ตรง ๆ ไม่เก็บใส่ ref — selector ของ zustand ทำให้
   * คอมโพเนนต์ re-render เมื่อค่าเปลี่ยนอยู่แล้ว การใส่ ref เพิ่มมีแต่จะ
   * ทำให้ค่าที่อ่านตอน render ไม่ตรงกับที่ React เห็น
   */
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      /*
       * iOS: inactive คือช่วงที่ระบบกำลังจะถ่ายภาพ ต้องบังตรงนี้
       * Android: ไม่มี inactive จึงต้องรับ background ด้วย
       */
      setHidden(next !== 'active');
    });

    return () => subscription.remove();
  }, []);

  if (!hidden || !authenticated) return null;

  return (
    <View
      /* ไม่ให้โปรแกรมอ่านหน้าจอประกาศแผ่นนี้ — มันไม่ใช่เนื้อหา */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        bottom: 0,
        gap: 12,
        justifyContent: 'center',
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        /* ต้องสูงกว่าทุกอย่างรวมถึง Modal ของแผ่นเลื่อน */
        zIndex: 9999,
      }}
    >
      <Ionicons
        color={theme.colors.primary}
        name="shield-checkmark-outline"
        size={44}
      />
      <Text tone="muted" variant="caption">
        ซ่อนข้อมูลไว้ระหว่างสลับแอป
      </Text>
    </View>
  );
}

/**
 * เครื่องนี้บล็อกการถ่ายภาพหน้าจอได้จริงไหม
 *
 * ใช้ตัดสินว่าจะบอกผู้ใช้ว่า "ภาพหน้าจอถูกปิดไว้" หรือไม่ — บอกว่าปิดแล้วทั้งที่
 * iOS ปิดไม่ได้คือการโกหกผู้ใช้เรื่องความปลอดภัย
 */
export const canBlockScreenCapture = Platform.OS === 'android';
