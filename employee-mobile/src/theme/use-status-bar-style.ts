import type { StatusBarStyle } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * แอปวาดพื้นหลังใต้แถบสถานะเองหรือเปล่า
 *
 * **iOS ตอบใช่เสมอ** — แถบสถานะของ iOS เป็นเลเยอร์ลอยทับเนื้อหาของแอป ไม่มี
 * ใครมาทาพื้นหลังให้ สิ่งที่อยู่หลังนาฬิกาคือจอของเราเองทุกกรณี (รวมตอนที่
 * inset เป็น 0 เช่นแนวนอนที่แถบถูกซ่อน ซึ่งสีไอคอนไม่มีผลอยู่แล้ว)
 *
 * ฝั่ง Android ต้องถาม inset จริง: `insets.top > 0` แปลว่าพื้นที่แถบสถานะถูก
 * นับเป็นส่วนหนึ่งของหน้าต่างแอป (edge-to-edge) สีตรงนั้นจึงเป็นสีของจอที่
 * เปิดอยู่ ถ้าเป็น 0 แปลว่าหน้าต่างถูกตัดออกจากแถบไปแล้ว — ระบบเป็นเจ้าของ
 * พื้นหลังตรงนั้นแทน และค่าเริ่มต้นคือดำสนิท
 *
 * ไม่ตรวจด้วยชื่อ Expo Go หรือรุ่น Android โดยตั้งใจ — เงื่อนไขจริงคือ
 * "เราวาดใต้แถบหรือเปล่า" ซึ่ง inset ตอบตรง ๆ อยู่แล้ว
 */
function useDrawsUnderStatusBar() {
  const insets = useSafeAreaInsets();

  return Platform.OS !== 'android' || insets.top > 0;
}

/**
 * สีไอคอนแถบสถานะที่ "มองเห็นจริง" บนเครื่องที่กำลังรันอยู่
 *
 * ตั้งสไตล์เป็น `dark` = ไอคอนนาฬิกา/แบตเป็นสีเข้ม ซึ่งถูกต้องเมื่อแอปวาดพื้นหลัง
 * ของตัวเองอยู่ใต้แถบสถานะ — พื้นฟ้าอ่อนของเรากับไอคอนเข้มอ่านออกดี จอที่พื้น
 * ตรงนั้นเป็นสีเข้ม (หัวจอผู้บริหาร) จึงขอ `light` มาได้ตามจริง
 *
 * แต่ถ้าแอปไม่ได้วาดใต้แถบ สิ่งที่อยู่หลังนาฬิกาไม่ใช่จอนั้นแล้ว แต่เป็นแถบที่
 * `useSystemStatusBarBackground` ทาสีอ่อนไว้ให้ทั้งแอป — ค่าที่จอขอมาจึงใช้ไม่ได้
 * ต้องเป็นไอคอนเข้มเสมอ ไม่งั้นได้ขาวบนขาว
 */
export function useVisibleStatusBarStyle(
  preferred: StatusBarStyle,
): StatusBarStyle {
  return useDrawsUnderStatusBar() ? preferred : 'dark';
}

/**
 * ทาสีพื้นหลังแถบสถานะบนเครื่องที่แอปวาดใต้แถบไม่ได้
 *
 * ## ปัญหาที่ตัวนี้แก้
 *
 * บนเครื่องที่หน้าต่างแอปถูกตัดออกจากแถบสถานะ ระบบเป็นคนทาพื้นหลังตรงนั้นเอง
 * และค่าเริ่มต้นคือดำสนิท ผลคือแถบนาฬิกา/แบตเป็นแถบดำคาดอยู่เหนือหัวจอสีขาว
 * ของแอป มองแล้วเหมือนแอปถูกเฉือนออกไปหนึ่งแถบ ไม่ใช่แอปที่เต็มจอ
 *
 * ทาเองด้วยสีเดียวกับพื้นหัวจอ รอยต่อก็หายไป
 *
 * ## ทำไมไม่ใช้ `<StatusBar backgroundColor>` ของ expo-status-bar
 *
 * expo-status-bar ตัด prop นั้นทิ้งไปแล้วตั้งแต่ SDK ที่บังคับ edge-to-edge
 * เหลือแต่ API ของ react-native ที่ยังสั่งได้อยู่
 *
 * เรียกเฉพาะตอนที่ระบบเป็นเจ้าของแถบจริง ๆ — บนเครื่องที่เป็น edge-to-edge
 * คำสั่งนี้ไม่มีผลและมีแต่จะทิ้ง warning ไว้เปล่า ๆ
 */
export function useSystemStatusBarBackground(color: string) {
  const drawsUnderStatusBar = useDrawsUnderStatusBar();

  useEffect(() => {
    /* iOS ไม่มีทางเข้าถึงบรรทัดล่าง — `drawsUnderStatusBar` เป็นจริงตายตัว */
    if (drawsUnderStatusBar) return;

    StatusBar.setBackgroundColor(color, true);
  }, [color, drawsUnderStatusBar]);
}
