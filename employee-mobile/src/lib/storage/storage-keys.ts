export const storageKeys = {
  /**
   * ผู้ใช้ที่เปิดปลดล็อกด้วยไบโอเมตริกไว้บนเครื่องนี้
   *
   * เก็บเป็น userId ไม่ใช่ boolean โดยตั้งใจ — เครื่องที่ส่งต่อให้คนอื่นใช้
   * ต้องไม่ยกสวิตช์ของคนเดิมมาให้คนใหม่ ค่าที่ไม่ตรงกับผู้ใช้ปัจจุบันเท่ากับปิด
   */
  biometricUserId: 'hr_employee_mobile.biometric_user_id',
  installationId: 'hr_employee_mobile.installation_id',
  /** จำนวนครั้งที่ใส่ PIN ผิดติดกัน — ครบเพดานแล้วต้องล็อกอินใหม่ */
  pinAttempts: 'hr_employee_mobile.pin_attempts',
  pinHash: 'hr_employee_mobile.pin_hash',
  pinSalt: 'hr_employee_mobile.pin_salt',
  /** PIN ผูกกับผู้ใช้คนเดียว เครื่องที่เปลี่ยนคนใช้ต้องตั้งใหม่เสมอ */
  pinUserId: 'hr_employee_mobile.pin_user_id',
  /**
   * เคยเด้งขอสิทธิ์แจ้งเตือนบนเครื่องนี้ไปแล้วหรือยัง
   *
   * ผูกกับ "เครื่อง" ไม่ใช่ผู้ใช้ เพราะสิทธิ์แจ้งเตือนเป็นของระบบปฏิบัติการ
   * ซึ่งถามได้ครั้งเดียวจริง ๆ — Android ตั้งแต่ 13 ปฏิเสธคำขอครั้งที่สอง
   * ทันทีโดยไม่แสดงอะไรให้ผู้ใช้เห็น ถามซ้ำจึงไม่ได้อะไรนอกจากปิดทางตัวเอง
   */
  pushPermissionAsked: 'hr_employee_mobile.push_permission_asked',
  refreshToken: 'hr_employee_mobile.refresh_token',
} as const;
