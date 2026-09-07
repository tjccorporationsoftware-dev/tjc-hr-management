import { ApprovalMatrixTargetType } from '../../../generated/prisma/client';

import {
  isSupportedApprovalTargetType,
  SUPPORTED_APPROVAL_TARGET_TYPES,
} from './supported-target-types.util';

/**
 * สายอนุมัติต้องตั้งได้เฉพาะประเภทที่ต่อสายไว้จริง
 *
 * enum ในสคีมามี 8 ค่า แต่มีเพียง 4 ค่าที่มีโค้ดเรียก resolver
 * หน้าจอซ่อนอีก 4 ค่าไว้อยู่แล้ว แต่ API ยังรับได้ทั้งหมด
 * ใครยิงตรงเข้า API จึงสร้างสายอนุมัติที่ดูเหมือนมีผลแต่ไม่มีอะไรบังคับได้
 */
describe('ประเภทรายการที่สายอนุมัติรองรับ', () => {
  it('รองรับ 4 ประเภทที่มีโค้ดเรียก resolver จริง', () => {
    expect([...SUPPORTED_APPROVAL_TARGET_TYPES].sort()).toEqual(
      [
        'LEAVE_REQUEST',
        'OFFSITE_WORK_REQUEST',
        'OVERTIME_REQUEST',
        'TIME_ADJUST_REQUEST',
      ].sort(),
    );
  });

  it('ปฏิเสธประเภทที่ยังไม่มีอะไรเรียกใช้', () => {
    expect(isSupportedApprovalTargetType('DOCUMENT_REQUEST')).toBe(false);
    expect(isSupportedApprovalTargetType('PAYROLL_RUN')).toBe(false);
    expect(isSupportedApprovalTargetType('EMPLOYEE_CHANGE')).toBe(false);
    expect(isSupportedApprovalTargetType('GENERAL')).toBe(false);
  });

  it('ค่าที่ไม่มีใน enum เลย ก็ต้องปฏิเสธ', () => {
    expect(isSupportedApprovalTargetType('ไม่มีจริง')).toBe(false);
    expect(isSupportedApprovalTargetType(undefined)).toBe(false);
    expect(isSupportedApprovalTargetType(null)).toBe(false);
  });

  it('ทุกค่าที่รองรับ ต้องมีอยู่ใน enum ของสคีมาจริง', () => {
    const schemaValues = Object.values(ApprovalMatrixTargetType) as string[];

    for (const value of SUPPORTED_APPROVAL_TARGET_TYPES) {
      expect(schemaValues).toContain(value);
    }
  });

  it('เตือนเมื่อมีการเพิ่มค่าใหม่ใน enum โดยไม่ได้ตัดสินใจว่ารองรับหรือไม่', () => {
    // ถ้าเทสนี้ล้ม แปลว่ามีคนเพิ่มค่าใน ApprovalMatrixTargetType
    // ต้องตัดสินใจว่าจะต่อสายให้ (ใส่ใน SUPPORTED_...) หรือจงใจไม่รองรับ (แก้ตัวเลขนี้)
    expect(Object.values(ApprovalMatrixTargetType)).toHaveLength(8);
  });
});
