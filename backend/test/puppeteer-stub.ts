/**
 * ตัวแทน puppeteer สำหรับ jest เท่านั้น
 *
 * puppeteer 25 เป็น ESM ล้วน (`"type": "module"`) ส่วน jest ของโปรเจกต์นี้
 * รันแบบ CommonJS และไม่ transform node_modules ไฟล์ไหนที่ import มาถึง
 * `payroll-payslip-pdf.util.ts` จึงพังทั้ง suite ด้วย `Unexpected token 'export'`
 * ทั้งที่ไม่ได้จะสร้าง PDF เลย
 *
 * เดิมแก้ด้วย `jest.mock('puppeteer', ...)` ทีละไฟล์ ซึ่งพลาดได้ง่ายมาก —
 * spec ใหม่ที่ import service ตัวไหนก็ตามที่ลากไปถึง payroll pdf จะพังเงียบ ๆ
 * แบบที่ไม่มีอะไรชี้ว่าเกี่ยวกับ puppeteer (ตอนตรวจพบ มี 7 suite ของ Mobile
 * ที่รันไม่ได้เลยด้วยสาเหตุนี้) จึง map ไว้ที่ jest config ให้จบทีเดียว
 *
 * ถ้าวันหนึ่งต้องเทสการสร้าง PDF จริง ให้เขียนเป็น e2e ที่รัน Chromium จริง
 * ไม่ใช่ปลดตัว map นี้ออก — unit test เปิดเบราว์เซอร์ไม่ได้อยู่แล้ว
 */

const notAvailable = () => {
  throw new Error(
    'puppeteer ถูก stub ไว้ในเทส — การสร้าง PDF จริงต้องทดสอบระดับ e2e',
  );
};

export const launch = notAvailable;
export const connect = notAvailable;
export const executablePath = () => '';

export default { connect, executablePath, launch };
