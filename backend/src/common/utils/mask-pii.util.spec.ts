import {
  canReadSensitive,
  isMaskedValue,
  maskEmployeeSensitiveData,
  maskTail,
  SENSITIVE_READ_PERMISSION,
} from './mask-pii.util';

/**
 * เทสต์การปกปิดข้อมูลส่วนบุคคล (PDPA)
 *
 * ประเด็นที่กันไว้:
 *  1. เดิมใครมี EMPLOYEE_READ เห็นเลขบัตร/เลขบัญชีครบทุกหลัก รวมหัวหน้างาน
 *  2. เมื่อปกปิดแล้ว ต้องกันไม่ให้ค่าที่ถูกปิดหลักถูกบันทึกทับเลขจริง
 */
describe('maskTail', () => {
  it('ปิดเลขบัตรแต่คงขีดคั่นไว้ เพื่อให้ยังแยกคนได้', () => {
    expect(maskTail('1-2345-67890-12-3')).toBe('x-xxxx-xxxx0-12-3');
  });

  it('ปิดเลขบัตรที่ไม่มีขีดคั่น', () => {
    expect(maskTail('1234567890123')).toBe('xxxxxxxxx0123');
  });

  it('ปิดเลขบัญชีธนาคาร เหลือ 4 ตัวท้าย', () => {
    expect(maskTail('1234567890')).toBe('xxxxxx7890');
  });

  it('พาสปอร์ตเหลือ 3 ตัวท้ายตามที่สั่ง', () => {
    expect(maskTail('AB1234567', 3)).toBe('xxxxxx567');
  });

  it('ค่าสั้นเกินกว่าจะปิดได้อย่างมีความหมาย ปิดทั้งหมด', () => {
    expect(maskTail('123', 4)).toBe('xxx');
    expect(maskTail('1234', 4)).toBe('xxxx');
  });

  it('ค่าว่างหรือไม่ใช่ข้อความ ไม่พัง', () => {
    expect(maskTail(null)).toBeNull();
    expect(maskTail(undefined)).toBeNull();
    expect(maskTail('')).toBe('');
  });
});

describe('canReadSensitive', () => {
  it('มีสิทธิ์ EMPLOYEE_SENSITIVE_READ เห็นเต็ม', () => {
    expect(canReadSensitive([SENSITIVE_READ_PERMISSION], 'u1', 'u2')).toBe(true);
  });

  it('ไม่มีสิทธิ์ แต่เป็นข้อมูลของตัวเอง เห็นเต็ม', () => {
    expect(canReadSensitive(['EMPLOYEE_READ'], 'u1', 'u1')).toBe(true);
  });

  it('หัวหน้างานเปิดดูลูกทีม ไม่เห็นเต็ม', () => {
    expect(canReadSensitive(['EMPLOYEE_READ'], 'u1', 'u2')).toBe(false);
  });

  it('ไม่ส่งสิทธิ์มาเลย ต้องถือว่าไม่มีสิทธิ์ (fail-closed)', () => {
    expect(canReadSensitive(undefined, 'u1', 'u2')).toBe(false);
  });

  it('พนักงานที่ยังไม่มีบัญชีผู้ใช้ ไม่ถูกจับคู่เป็น "ตัวเอง" โดยบังเอิญ', () => {
    expect(canReadSensitive(['EMPLOYEE_READ'], null, null)).toBe(false);
    expect(canReadSensitive(['EMPLOYEE_READ'], 'u1', null)).toBe(false);
  });
});

describe('maskEmployeeSensitiveData', () => {
  const employee = {
    id: 'emp-1',
    displayName: 'สมชาย ใจดี',
    profile: {
      nationalId: '1-2345-67890-12-3',
      passportNo: 'AB1234567',
      taxId: '1234567890123',
      socialSecurityNo: '9876543210987',
      bankAccountNo: '1234567890',
      gender: 'MALE',
    },
    compensations: [{ bankAccountNo: '5555666677', baseSalary: 30000 }],
  };

  it('มีสิทธิ์เต็ม คืนอ็อบเจ็กต์เดิมไม่แตะต้อง', () => {
    expect(maskEmployeeSensitiveData(employee, true)).toBe(employee);
  });

  it('ไม่มีสิทธิ์ ปิดทุกฟิลด์อ่อนไหวทั้งใน profile และ compensation', () => {
    const masked = maskEmployeeSensitiveData(employee, false);

    expect(masked.profile.nationalId).toBe('x-xxxx-xxxx0-12-3');
    expect(masked.profile.passportNo).toBe('xxxxxx567');
    expect(masked.profile.taxId).toBe('xxxxxxxxx0123');
    expect(masked.profile.socialSecurityNo).toBe('xxxxxxxxx0987');
    expect(masked.profile.bankAccountNo).toBe('xxxxxx7890');
    expect(masked.compensations[0].bankAccountNo).toBe('xxxxxx6677');
  });

  it('ฟิลด์ที่ไม่อ่อนไหวยังอยู่ครบ ใช้งานหน้าจอได้ปกติ', () => {
    const masked = maskEmployeeSensitiveData(employee, false);

    expect(masked.displayName).toBe('สมชาย ใจดี');
    expect(masked.profile.gender).toBe('MALE');
    expect(masked.compensations[0].baseSalary).toBe(30000);
  });

  it('ไม่แก้อ็อบเจ็กต์ต้นฉบับ (กัน cache ของ Prisma ปนเปื้อน)', () => {
    maskEmployeeSensitiveData(employee, false);

    expect(employee.profile.nationalId).toBe('1-2345-67890-12-3');
  });
});

describe('isMaskedValue', () => {
  it('ค่าที่ถูกปิดหลักแล้ว ต้องถูกจับได้ว่าห้ามบันทึกทับ', () => {
    expect(isMaskedValue('x-xxxx-xxxx0-12-3')).toBe(true);
    expect(isMaskedValue('xxxxxx7890')).toBe(true);
  });

  it('เลขจริงต้องบันทึกได้ตามปกติ', () => {
    expect(isMaskedValue('1-2345-67890-12-3')).toBe(false);
    expect(isMaskedValue('1234567890')).toBe(false);
  });

  it('ค่าว่าง/ไม่ใช่ข้อความ ไม่ถือว่าถูกปกปิด', () => {
    expect(isMaskedValue(undefined)).toBe(false);
    expect(isMaskedValue(null)).toBe(false);
    expect(isMaskedValue('')).toBe(false);
  });
});
