import { ApiError } from '@/lib/api/api-error';

export interface AuthErrorView {
  /** true = ผู้ใช้แก้เองได้ด้วยการลองใหม่ (เน็ต/เซิร์ฟเวอร์) */
  canRetry: boolean;
  /**
   * บอกว่าให้ทำอะไรต่อ — แยกจาก `message` เพื่อให้จอวางเป็นบรรทัดรองสีจางได้
   * ไม่มีก็ไม่แสดง ไม่ต้องยัดคำว่า "กรุณาลองใหม่" ไปทุกกรณีให้รก
   */
  hint: string | null;
  /** บรรทัดเดียวที่บอกว่าเกิดอะไรขึ้น — เป็นข้อความหลักของกล่อง */
  message: string;
  /**
   * รหัสอ้างอิงแบบสั้นสำหรับแจ้งฝ่ายบุคคล
   *
   * มีเฉพาะกรณีที่ต้นเหตุอยู่ฝั่งเซิร์ฟเวอร์ — ตอนรหัสผ่านผิด ผู้ใช้ไม่ต้อง
   * เอารหัสอะไรไปบอกใคร โชว์ UUID ยาวสามสิบหกตัวตรงนั้นมีแต่ทำให้กล่องรก
   * และกลบข้อความที่เขาต้องอ่านจริง ๆ
   */
  reference: string | null;
  requestId: string | null;
  title: string;
}

/**
 * ตัดรหัสอ้างอิงให้เหลือท่อนท้าย
 *
 * ท่อนหน้าของ UUID รุ่นเรียงตามเวลาซ้ำกันได้ทั้งนาที ส่วนท่อนท้ายเป็นค่าสุ่ม
 * สิบสองตัวก็พอให้ค้นใน log เจอตัวเดียว และอ่านให้ฟังทางโทรศัพท์ได้จบในลมเดียว
 */
function shortReference(requestId: string | null): string | null {
  if (!requestId) return null;

  const tail = requestId.split('-').pop() ?? requestId;

  return tail.length >= 8 ? tail : requestId.slice(-12);
}

/**
 * แปลง error ตอนเข้าสู่ระบบเป็นข้อความที่ผู้ใช้ทำอะไรต่อได้ (บทที่ 8.2 / 9.8)
 *
 * ข้อความส่วนใหญ่มาจาก backend เป็นภาษาไทยอยู่แล้วและตรงบริบทกว่า
 * ที่นี่จึงเติมเฉพาะกรณีที่ backend บอกไม่ได้ เช่น เน็ตไม่ถึงเซิร์ฟเวอร์
 */
export function toAuthErrorView(error: unknown): AuthErrorView {
  if (!(error instanceof ApiError)) {
    return {
      canRetry: true,
      hint: 'กรุณาลองใหม่อีกครั้ง',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
      reference: null,
      requestId: null,
      title: 'เข้าสู่ระบบไม่สำเร็จ',
    };
  }

  if (error.isNetworkError) {
    return {
      canRetry: true,
      hint: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
      message: 'เชื่อมต่อระบบไม่ได้',
      reference: null,
      requestId: error.requestId,
      title: 'ไม่มีการเชื่อมต่อ',
    };
  }

  if (error.isTimeout) {
    return {
      canRetry: true,
      hint: 'กรุณาลองใหม่อีกครั้ง',
      message: 'ระบบตอบกลับช้ากว่าปกติ',
      reference: shortReference(error.requestId),
      requestId: error.requestId,
      title: 'ระบบตอบกลับช้า',
    };
  }

  if (error.status === 429) {
    return {
      canRetry: true,
      hint: null,
      message: error.message,
      reference: null,
      requestId: error.requestId,
      title: 'ลองบ่อยเกินไป',
    };
  }

  if (error.status !== null && error.status >= 500) {
    return {
      canRetry: true,
      hint: 'ลองใหม่ภายหลัง หากยังไม่ได้ให้แจ้งฝ่ายบุคคลพร้อมรหัสอ้างอิง',
      message: 'ระบบขัดข้องชั่วคราว',
      reference: shortReference(error.requestId),
      requestId: error.requestId,
      title: 'ระบบขัดข้อง',
    };
  }

  if (error.code === 'APP_UPDATE_REQUIRED') {
    return {
      canRetry: false,
      hint: null,
      message: error.message,
      reference: null,
      requestId: error.requestId,
      title: 'ต้องอัปเดตแอป',
    };
  }

  /* รหัสผิด บัญชีถูกระงับ ฯลฯ — backend บอกเองได้ตรงกว่า และผู้ใช้แก้เองได้ */
  return {
    canRetry: false,
    hint: null,
    message: error.message,
    reference: null,
    requestId: error.requestId,
    title: 'เข้าสู่ระบบไม่สำเร็จ',
  };
}
