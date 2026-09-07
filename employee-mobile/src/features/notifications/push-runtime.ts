import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

/**
 * โหลด expo-notifications แบบ lazy
 *
 * ตั้งแต่ SDK 53 Expo Go ถอด remote push ออก และโมดูลจะ **โยน error ตั้งแต่
 * ตอน import** ไม่ใช่ตอนเรียกใช้ ถ้า import ไว้ที่ระดับบนสุดของไฟล์ที่ถูก
 * ลากเข้า auth.service → _layout ทั้งแอปจะเปิดไม่ขึ้นบน Expo Go
 * ไม่ใช่แค่ push ที่ใช้ไม่ได้ จึงต้องโหลดเมื่อจำเป็นและเฉพาะที่รองรับเท่านั้น
 *
 * **ห้ามใช้ `executionEnvironment` แยก** — ค่า `storeClient` ครอบทั้ง Expo Go
 * และ development build ซึ่ง dev build คือที่ที่ push ต้องทำงาน
 * `appOwnership === 'expo'` เป็นค่าเดียวที่แยกสองอย่างนี้ออกจากกันได้จริง
 * (ถึงจะติดป้าย deprecated ไว้ก็ตาม)
 */
/**
 * ตัดสินว่าสภาพแวดล้อมนี้ใช้ push ได้ไหม
 *
 * แยกเป็นฟังก์ชันล้วนเพื่อให้เทสได้โดยไม่ต้อง mock `react-native`
 * (การ mock ทั้งโมดูลไปปลุก lazy getter ของ RN แล้วพังทั้งไฟล์เทส)
 *
 * push ใช้ได้เฉพาะ **แอปเนทีฟที่ build เอง** เท่านั้น — ต้องกันสองอย่าง:
 *   1. Expo Go ตั้งแต่ SDK 53 ถอด remote push ออก
 *   2. **เว็บ** ซึ่งพลาดง่ายที่สุด เพราะ `appOwnership` บนเว็บเป็น null
 *      เหมือน dev build เป๊ะ ๆ แยกด้วยค่านั้นไม่ได้
 */
export function resolvePushSupport(params: {
  appOwnership: string | null | undefined;
  platform: string;
}): boolean {
  if (params.platform === 'web') {
    return false;
  }

  return params.appOwnership !== AppOwnership.Expo;
}

export const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

export const isPushSupported = resolvePushSupport({
  appOwnership: Constants.appOwnership,
  platform: Platform.OS,
});

let cached: NotificationsModule | null = null;
let handlerInstalled = false;

/**
 * เหตุผลที่โหลดโมดูลไม่สำเร็จครั้งล่าสุด
 *
 * เก็บไว้เพราะ "โหลดไม่ได้" มีได้หลายสาเหตุที่แก้คนละทาง (ยังไม่ได้ผูก native
 * module · สภาพแวดล้อมไม่รองรับ · โมดูลพังตอน import) แต่ตัวเรียกเห็นแค่ `null`
 * เหมือนกันหมด จอตรวจแจ้งเตือนจึงบอกผู้ใช้ไม่ได้ว่าต้องไปแก้อะไร
 */
let lastLoadError: string | null = null;

/** ข้อความจริงจากครั้งล่าสุดที่โหลดโมดูลแจ้งเตือนไม่สำเร็จ */
export function getNotificationLoadError(): string | null {
  return lastLoadError;
}

/**
 * โหลดโมดูลจริง + ติดตั้ง handler ครั้งเดียว
 *
 * แยกออกมาเพราะมีสองทางเข้าที่เงื่อนไขไม่เท่ากัน (push จากเซิร์ฟเวอร์ กับ
 * แจ้งเตือนที่แอปยิงเองในเครื่อง) แต่ต้องใช้อินสแตนซ์เดียวกัน — ถ้าต่างคนต่าง
 * import handler จะถูกติดตั้งสองรอบ
 */
async function importNotifications(): Promise<NotificationsModule | null> {
  try {
    cached ??= await import('expo-notifications');
    lastLoadError = null;
  } catch (error) {
    /* build ที่ยังไม่ได้ผูก native module — ถือว่าไม่รองรับ ไม่ใช่ error */
    lastLoadError = error instanceof Error ? error.message : String(error);

    return null;
  }

  if (!handlerInstalled) {
    handlerInstalled = true;

    /* ติดตั้ง handler พังไม่ควรทำให้ยิงแจ้งเตือนไม่ได้ — มันคุมแค่ว่าจะโชว์
       ตอนแอปเปิดอยู่ไหม ส่วนการยิงเข้าแถบแจ้งเตือนทำงานแยกกัน */
    /*
     * แจ้งเตือนที่เข้ามาตอนเปิดแอปอยู่ต้องแสดงให้เห็น
     * ค่าเริ่มต้นของระบบคือเงียบเมื่อแอปอยู่หน้าจอ ซึ่งทำให้หัวหน้าที่กำลัง
     * เปิดแอปอยู่พลาดใบที่เพิ่งเข้ามา
     */
    try {
      cached.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch (error) {
      lastLoadError = error instanceof Error ? error.message : String(error);
    }
  }

  return cached;
}

export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isPushSupported) {
    return null;
  }

  return importNotifications();
}

/**
 * โหลดโมดูลสำหรับ **แจ้งเตือนที่แอปยิงเองในเครื่อง** (local notification)
 *
 * เงื่อนไขต่างจาก `loadNotifications` ตรงที่ **ไม่กัน Expo Go** — สิ่งที่ Expo Go
 * ตั้งแต่ SDK 53 ถอดออกคือ *remote push* (การรับข้อความจากเซิร์ฟเวอร์ผ่าน
 * FCM/APNs) ส่วนการตั้งเวลาให้แอปเด้งแจ้งเตือนของตัวเองยังทำได้ตามปกติ
 *
 * กันไว้แค่เว็บ ซึ่งไม่มีแถบแจ้งเตือนของระบบให้เด้ง
 *
 * ใช้กับจอตัวอย่างแจ้งเตือน — ถ้าใช้ตัวเดียวกับ push จอนั้นจะกดไม่ได้เลยบน
 * Expo Go ทั้งที่หน้าตาที่ต้องตรวจแสดงได้จริง
 */
export async function loadLocalNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    lastLoadError = 'เว็บไม่มีแถบแจ้งเตือนของระบบ';

    return null;
  }

  /*
   * Expo Go บน Android **import โมดูลนี้ไม่ได้เลย** ไม่ใช่แค่ push ที่ใช้ไม่ได้
   *
   * ไล่ stack แล้วเจอว่า `index.js` ลากเอา `getExpoPushTokenAsync` →
   * `DevicePushTokenAutoRegistration.fx` → `addPushTokenListener` เข้ามาตั้งแต่
   * ตอนโหลดโมดูล แล้วตัวนั้น **throw** ทันทีเมื่อรันใน Expo Go ตั้งแต่ SDK 53
   * ทั้งไฟล์จึงพังก่อนจะถึงฟังก์ชันของ local notification ที่ยังใช้ได้จริง
   *
   * กันตั้งแต่ตรงนี้เพื่อไม่ให้ error ก้อนนั้นเด้งขึ้นจอทุกครั้งที่กดปุ่ม
   */
  if (isExpoGo) {
    lastLoadError =
      'Expo Go บน Android โหลดโมดูลแจ้งเตือนไม่ได้เลยตั้งแต่ SDK 53 — ต้องใช้ development build';

    return null;
  }

  return importNotifications();
}

/**
 * ยิงแจ้งเตือนของระบบได้ไหม
 *
 * เว็บทำไม่ได้เพราะไม่มีแถบแจ้งเตือน ส่วน Expo Go ทำไม่ได้เพราะโมดูล import
 * ไม่ผ่าน (ดูเหตุผลใน `loadLocalNotifications`) — เหลือ dev build กับแอปจริง
 */
export const isLocalNotificationSupported =
  Platform.OS !== 'web' && !isExpoGo;
