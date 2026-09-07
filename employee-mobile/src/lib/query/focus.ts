import { focusManager, type QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

/**
 * บอก react-query ว่า "ผู้ใช้กลับมาที่แอปแล้ว"
 *
 * ## ทำไมต้องเขียนเอง
 *
 * react-query ตรวจ window focus ให้อัตโนมัติเฉพาะบนเว็บ บน React Native
 * ไม่มี `window` ให้ฟัง ถ้าไม่ต่อ AppState เข้าไปเอง `refetchOnWindowFocus`
 * จะไม่มีวันทำงาน — ข้อมูลที่โหลดไปแล้วจะค้างใน cache จนกว่าผู้ใช้จะ
 * pull-to-refresh เอง
 *
 * **อาการที่เคยเจอจริง:** พนักงานเปิดจอเงินเดือนตอนที่ HR ยังไม่ประกาศงวด
 * (ได้รายการว่าง) พอ HR ประกาศเสร็จแล้วสลับกลับมาดู ก็ยังเห็น "ยังไม่มีสลิป"
 * อยู่เหมือนเดิม ทั้งที่ API คืนข้อมูลถูกต้องแล้ว — ผู้ใช้อ่านว่าแอปพัง
 * ซึ่งถูกต้องในมุมของเขา
 *
 * เรื่องนี้กระทบทุกจอที่ข้อมูลเปลี่ยนจากฝั่งอื่นได้: คิวอนุมัติที่หัวหน้าคนอื่น
 * เพิ่งเคลียร์ไป ยอดวันลาหลัง HR ปรับ สถานะคำขอที่เพิ่งถูกอนุมัติ
 *
 * ## ที่ตั้งใจไม่ทำ
 *
 * ไม่ต่อ `onlineManager` กับ NetInfo เพราะต้องเพิ่ม dependency อีกตัวเพื่อ
 * แก้ปัญหาที่เบากว่ามาก (react-query retry ให้อยู่แล้วเมื่อเน็ตกลับมา)
 * ถ้าวันหนึ่งต้องการ pause query ตอนออฟไลน์จริง ๆ ค่อยเพิ่มทีหลัง
 */
export function installQueryFocusManager() {
  focusManager.setEventListener((handleFocus) => {
    const onChange = (status: AppStateStatus) => {
      /*
       * นับเฉพาะ 'active' เป็น focus — 'inactive' บน iOS เกิดตอนลากแถบ
       * ควบคุมลงมาหรือมีสายเข้า ซึ่งผู้ใช้ยังอยู่กับแอปอยู่
       */
      handleFocus(status === 'active');
    };

    const subscription = AppState.addEventListener('change', onChange);

    return () => subscription.remove();
  });
}

/**
 * ล้าง cache ทั้งหมดตอนเปลี่ยนผู้ใช้
 *
 * เครื่องที่ส่งต่อกันใช้ต้องไม่เห็นข้อมูลของคนก่อนหน้าแวบหนึ่งก่อนโหลดใหม่ —
 * โดยเฉพาะจอเงินเดือนที่ข้อมูลอยู่ใน cache นานถึงครึ่งชั่วโมง
 */
export function resetQueryCache(client: QueryClient) {
  client.clear();
}

/** true เมื่อแพลตฟอร์มนี้ต้องพึ่ง AppState แทน window focus */
export const usesAppStateFocus = Platform.OS !== 'web';
