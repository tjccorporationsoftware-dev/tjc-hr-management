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
  refreshToken: 'hr_employee_mobile.refresh_token',
} as const;
