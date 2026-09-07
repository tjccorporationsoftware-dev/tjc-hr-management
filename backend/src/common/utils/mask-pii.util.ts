/**
 * ปกปิดข้อมูลส่วนบุคคลที่อ่อนไหว (PII masking)
 * -----------------------------------------------------------------------------
 * เดิมทุกคนที่มีสิทธิ์ `EMPLOYEE_READ` เห็นเลขบัตรประชาชน เลขพาสปอร์ต เลขภาษี
 * เลขประกันสังคม และเลขบัญชีธนาคาร "ครบทุกหลัก" รวมถึงหัวหน้างานที่เปิดดูลูกทีม
 * ซึ่งเกินความจำเป็นตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) มาตรา 22
 *
 * แนวทาง: ปกปิดเป็นค่าเริ่มต้น แล้วเปิดให้เห็นเต็มเฉพาะกรณีที่จำเป็นจริง
 *   1) มีสิทธิ์ EMPLOYEE_SENSITIVE_READ (HR / ฝ่ายบัญชีเงินเดือน)
 *   2) เป็นข้อมูลของตัวเอง
 *
 * หมายเหตุ: ไฟล์นำส่ง สปส. / ภ.ง.ด. / ไฟล์โอนเงินธนาคาร **ไม่ผ่านตัวปกปิดนี้**
 * เพราะกฎหมายบังคับให้ส่งเลขเต็ม และเส้นทางเหล่านั้นถูกคุมด้วยสิทธิ์ฝั่ง payroll อยู่แล้ว
 */

/** สิทธิ์ที่ทำให้เห็นข้อมูลอ่อนไหวแบบเต็ม */
export const SENSITIVE_READ_PERMISSION = 'EMPLOYEE_SENSITIVE_READ';

/** ตัวอักษรที่ใช้แทนหลักที่ถูกปิด */
const MASK_CHAR = 'x';

/**
 * ปิดทุกตัวอักษร/ตัวเลข ยกเว้น N ตัวท้าย โดยคงขีดคั่นเดิมไว้
 * เพื่อให้ HR ยังกวาดตาแยกคนได้ว่าเป็นคนละเลขกัน
 *
 *   '1-2345-67890-12-3' → 'x-xxxx-xxxxx-x2-3'
 *   '1234567890123'     → 'xxxxxxxxx0123'
 */
export function maskTail(value: string | null | undefined, visible = 4) {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const significantCount = trimmed.replace(/[^A-Za-z0-9]/g, '').length;

  // สั้นเกินกว่าจะปิดได้อย่างมีความหมาย ปิดทั้งหมดไปเลย
  const keep = significantCount > visible ? visible : 0;
  let remaining = significantCount - keep;

  return trimmed
    .split('')
    .map((char) => {
      if (!/[A-Za-z0-9]/.test(char)) {
        return char;
      }
      if (remaining > 0) {
        remaining -= 1;
        return MASK_CHAR;
      }
      return char;
    })
    .join('');
}

/**
 * ค่านี้ "หน้าตาเหมือนค่าที่ถูกปกปิด" หรือไม่
 *
 * จำเป็นเพราะเมื่อผู้ใช้ที่ไม่มีสิทธิ์เปิดฟอร์มแก้ไขพนักงาน ฟอร์มจะได้ค่าที่ปิดหลัก
 * ไปแสดง ถ้ากดบันทึกโดยไม่แตะช่องนั้น เบราว์เซอร์จะส่งค่าที่ปิดหลักกลับมา
 * แล้วทับเลขจริงในฐานข้อมูลทิ้ง — ข้อมูลหายถาวรและตรวจไม่เจอ
 * จึงต้องมองว่าค่าแบบนี้คือ "ไม่ได้แก้" เสมอ
 */
export function isMaskedValue(value: unknown) {
  return typeof value === 'string' && new RegExp(MASK_CHAR, 'i').test(value);
}

/** ฟิลด์อ่อนไหวใน EmployeeProfile และจำนวนหลักท้ายที่ยังให้เห็น */
const PROFILE_SENSITIVE_FIELDS: Record<string, number> = {
  nationalId: 4,
  passportNo: 3,
  taxId: 4,
  socialSecurityNo: 4,
  bankAccountNo: 4,
};

/** ฟิลด์อ่อนไหวใน EmployeeCompensation */
const COMPENSATION_SENSITIVE_FIELDS: Record<string, number> = {
  bankAccountNo: 4,
};

function maskFields<T>(record: T, fields: Record<string, number>): T {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const source = record as Record<string, unknown>;
  const masked: Record<string, unknown> = { ...source };

  for (const [field, visible] of Object.entries(fields)) {
    if (typeof source[field] === 'string') {
      masked[field] = maskTail(source[field] as string, visible);
    }
  }

  return masked as T;
}

/** ปกปิดฟิลด์อ่อนไหวใน profile ของพนักงาน */
export function maskEmployeeProfile<T>(profile: T): T {
  return maskFields(profile, PROFILE_SENSITIVE_FIELDS);
}

/** ปกปิดฟิลด์อ่อนไหวใน compensation ของพนักงาน */
export function maskEmployeeCompensation<T>(compensation: T): T {
  return maskFields(compensation, COMPENSATION_SENSITIVE_FIELDS);
}

/**
 * ตัดสินว่าผู้เรียกคนนี้ควรเห็นข้อมูลอ่อนไหวแบบเต็มหรือไม่
 *
 * @param permissions    สิทธิ์ของผู้เรียก
 * @param viewerUserId   userId ของผู้เรียก
 * @param targetUserId   userId ที่ผูกกับพนักงานที่กำลังเปิดดู (null ถ้าไม่มีบัญชี)
 */
export function canReadSensitive(
  permissions: readonly string[] | undefined,
  viewerUserId?: string | null,
  targetUserId?: string | null,
) {
  if (permissions?.includes(SENSITIVE_READ_PERMISSION)) {
    return true;
  }

  // ข้อมูลของตัวเอง เจ้าตัวเห็นได้เสมอ
  return Boolean(viewerUserId && targetUserId && viewerUserId === targetUserId);
}

/**
 * ปกปิด employee หนึ่งคน (พร้อม profile/compensation ที่ include มาด้วย)
 * คืนอ็อบเจ็กต์เดิมทันทีถ้าผู้เรียกมีสิทธิ์เห็นเต็ม เพื่อไม่ให้เสียแรง copy โดยเปล่าประโยชน์
 */
export function maskEmployeeSensitiveData<T>(employee: T, allowFull: boolean): T {
  if (allowFull || !employee || typeof employee !== 'object') {
    return employee;
  }

  const source = employee as Record<string, unknown>;
  const masked: Record<string, unknown> = { ...source };

  if (source.profile && typeof source.profile === 'object') {
    masked.profile = maskEmployeeProfile(source.profile);
  }

  if (Array.isArray(source.compensations)) {
    masked.compensations = source.compensations.map((item) =>
      maskEmployeeCompensation(item),
    );
  } else if (source.compensation && typeof source.compensation === 'object') {
    masked.compensation = maskEmployeeCompensation(source.compensation);
  }

  return masked as T;
}
