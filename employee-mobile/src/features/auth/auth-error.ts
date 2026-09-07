import { ApiError } from '@/lib/api/api-error';

export interface AuthErrorView {
  /** true = ผู้ใช้แก้เองได้ด้วยการลองใหม่ (เน็ต/เซิร์ฟเวอร์) */
  canRetry: boolean;
  message: string;
  requestId: string | null;
  title: string;
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
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง',
      requestId: null,
      title: 'เข้าสู่ระบบไม่สำเร็จ',
    };
  }

  if (error.isNetworkError) {
    return {
      canRetry: true,
      message: 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
      requestId: error.requestId,
      title: 'ไม่มีการเชื่อมต่อ',
    };
  }

  if (error.isTimeout) {
    return {
      canRetry: true,
      message: 'ระบบใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่อีกครั้ง',
      requestId: error.requestId,
      title: 'ระบบตอบกลับช้า',
    };
  }

  if (error.status === 429) {
    return {
      canRetry: true,
      message: error.message,
      requestId: error.requestId,
      title: 'ลองบ่อยเกินไป',
    };
  }

  if (error.status !== null && error.status >= 500) {
    return {
      canRetry: true,
      message: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง',
      requestId: error.requestId,
      title: 'ระบบขัดข้อง',
    };
  }

  if (error.code === 'APP_UPDATE_REQUIRED') {
    return {
      canRetry: false,
      message: error.message,
      requestId: error.requestId,
      title: 'ต้องอัปเดตแอป',
    };
  }

  return {
    canRetry: false,
    message: error.message,
    requestId: error.requestId,
    title: 'เข้าสู่ระบบไม่สำเร็จ',
  };
}
