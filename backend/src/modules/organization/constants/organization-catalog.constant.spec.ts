import {
  DEPARTMENT_CATALOG,
  LEGACY_DEPARTMENT_CODE_TO_REFERENCE_CODE,
} from './department-catalog.constant';
import {
  DIVISION_CATALOG,
  LEGACY_DIVISION_CODE_TO_REFERENCE_CODE,
} from './division-catalog.constant';
import {
  EMPLOYEE_TYPE_CATALOG,
  LEGACY_EMPLOYEE_TYPE_CODE_TO_REFERENCE_CODE,
} from './employee-type-catalog.constant';
import {
  LEGACY_POSITION_CODE_TO_REFERENCE_CODE,
  POSITION_CATALOG,
  POSITION_CATEGORIES,
} from './position-catalog.constant';
import { planLinks } from '../services/organization-catalog-bootstrap.service';

/**
 * ตาข่ายกันค่าคงที่ตำแหน่ง/ประเภทพนักงานพังเงียบ
 *
 * รายการพวกนี้ถูกซิงก์ลงฐานข้อมูลตอนแอปบูตด้วย `referenceCode` เป็นกุญแจ
 * ถ้าใส่รหัสซ้ำหรือชี้ไปที่รายการที่ไม่มีอยู่ จะไม่ฟ้องตอนบูต แต่กลายเป็น
 * ตัวเลือกหาย/ผูกไม่ติดที่หน้าโครงสร้างองค์กรแทน
 */
describe('POSITION_CATALOG', () => {
  it('referenceCode ห้ามซ้ำ เพราะเป็นกุญแจที่ใช้ upsert', () => {
    const codes = POSITION_CATALOG.map((item) => item.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('code ห้ามซ้ำ เพราะถูกใช้ตั้งรหัสตำแหน่งของบริษัทตอนกดเปิดใช้', () => {
    const codes = POSITION_CATALOG.map((item) => item.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ทุกรายการต้องมีชื่อไทย ไม่งั้นหน้าเลือกจะขึ้นบรรทัดว่าง', () => {
    for (const item of POSITION_CATALOG) {
      expect(item.nameTh.trim()).not.toBe('');
    }
  });

  it('ระดับตำแหน่งต้องอยู่ในช่วง 1-9 ให้ตรงกับตัวเลือกในฟอร์ม', () => {
    for (const item of POSITION_CATALOG) {
      expect(item.level).toBeGreaterThanOrEqual(1);
      expect(item.level).toBeLessThanOrEqual(9);
    }
  });

  it('category ต้องเป็นกลุ่มที่มีอยู่จริง ไม่งั้นตัวกรองสายงานจะกรองไม่เจอ', () => {
    for (const item of POSITION_CATALOG) {
      expect(Object.keys(POSITION_CATEGORIES)).toContain(item.category);
    }
  });
});

describe('EMPLOYEE_TYPE_CATALOG', () => {
  it('referenceCode ห้ามซ้ำ', () => {
    const codes = EMPLOYEE_TYPE_CATALOG.map((item) => item.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('code ห้ามซ้ำ', () => {
    const codes = EMPLOYEE_TYPE_CATALOG.map((item) => item.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ต้องมีอย่างน้อยหนึ่งรายการที่ตั้งเป็นค่าตั้งต้น', () => {
    // ไม่มีประเภทพนักงานเลย = ตั้งนโยบายลา/OT ไม่ได้ทั้งบริษัท
    expect(EMPLOYEE_TYPE_CATALOG.some((item) => item.isDefault)).toBe(true);
  });
});

describe('DEPARTMENT_CATALOG', () => {
  it('referenceCode ห้ามซ้ำ', () => {
    const codes = DEPARTMENT_CATALOG.map((item) => item.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('code ห้ามซ้ำ เพราะถูกใช้ตั้งรหัสแผนกของบริษัทตอนกดเปิดใช้', () => {
    const codes = DEPARTMENT_CATALOG.map((item) => item.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ทุกรายการต้องมีชื่อไทย', () => {
    for (const item of DEPARTMENT_CATALOG) {
      expect(item.nameTh.trim()).not.toBe('');
    }
  });
});

describe('DIVISION_CATALOG', () => {
  it('referenceCode ห้ามซ้ำ', () => {
    const codes = DIVISION_CATALOG.map((item) => item.referenceCode);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('code ห้ามซ้ำ', () => {
    const codes = DIVISION_CATALOG.map((item) => item.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ทุกฝ่ายต้องมีแผนกแม่ที่มีอยู่จริง ไม่งั้นจะถูกข้ามตอนซิงก์', () => {
    const known = new Set(DEPARTMENT_CATALOG.map((item) => item.referenceCode));

    for (const item of DIVISION_CATALOG) {
      expect({
        division: item.referenceCode,
        parentExists: known.has(item.departmentReferenceCode),
      }).toEqual({ division: item.referenceCode, parentExists: true });
    }
  });

  it('ทุกแผนกมาตรฐานควรมีฝ่ายอย่างน้อยหนึ่งรายการ', () => {
    // แผนกที่ไม่มีฝ่ายเลยจะขึ้นเป็นหมวดว่างในหน้าเลือกฝ่าย
    const withDivisions = new Set(
      DIVISION_CATALOG.map((item) => item.departmentReferenceCode),
    );

    for (const department of DEPARTMENT_CATALOG) {
      expect({
        department: department.referenceCode,
        hasDivision: withDivisions.has(department.referenceCode),
      }).toEqual({ department: department.referenceCode, hasDivision: true });
    }
  });
});

describe('ตารางจับคู่รหัสเดิม', () => {
  it('รหัสปลายทางของแผนกต้องมีอยู่จริงใน catalog', () => {
    const known = new Set(DEPARTMENT_CATALOG.map((item) => item.referenceCode));

    for (const [legacyCode, referenceCode] of Object.entries(
      LEGACY_DEPARTMENT_CODE_TO_REFERENCE_CODE,
    )) {
      expect({ legacyCode, exists: known.has(referenceCode) }).toEqual({
        legacyCode,
        exists: true,
      });
    }
  });

  it('รหัสปลายทางของฝ่ายต้องมีอยู่จริงใน catalog', () => {
    const known = new Set(DIVISION_CATALOG.map((item) => item.referenceCode));

    for (const [legacyCode, referenceCode] of Object.entries(
      LEGACY_DIVISION_CODE_TO_REFERENCE_CODE,
    )) {
      expect({ legacyCode, exists: known.has(referenceCode) }).toEqual({
        legacyCode,
        exists: true,
      });
    }
  });

  it('รหัสปลายทางของตำแหน่งต้องมีอยู่จริงใน catalog', () => {
    const known = new Set(POSITION_CATALOG.map((item) => item.referenceCode));

    for (const [legacyCode, referenceCode] of Object.entries(
      LEGACY_POSITION_CODE_TO_REFERENCE_CODE,
    )) {
      expect({ legacyCode, exists: known.has(referenceCode) }).toEqual({
        legacyCode,
        exists: true,
      });
    }
  });

  it('รหัสปลายทางของประเภทพนักงานต้องมีอยู่จริงใน catalog', () => {
    const known = new Set(
      EMPLOYEE_TYPE_CATALOG.map((item) => item.referenceCode),
    );

    for (const [legacyCode, referenceCode] of Object.entries(
      LEGACY_EMPLOYEE_TYPE_CODE_TO_REFERENCE_CODE,
    )) {
      expect({ legacyCode, exists: known.has(referenceCode) }).toEqual({
        legacyCode,
        exists: true,
      });
    }
  });
});

/**
 * planLinks คือส่วนที่ตัดสินว่าแถวเดิมของบริษัทควรผูกกับ catalog ตัวไหน
 * ถ้าพลาดจะเขียนทับความสัมพันธ์ของข้อมูลจริง จึงล็อกพฤติกรรมไว้ให้ครบทุกทาง
 */
describe('planLinks', () => {
  const catalogRows = [
    { id: 'cat-monthly', referenceCode: 'T01' },
    { id: 'cat-daily', referenceCode: 'T02' },
  ];
  const legacyMap = { MONTHLY: 'T01', DAILY: 'T02' };

  it('ผูกแถวที่รหัสตรงกับตารางจับคู่', () => {
    const plan = planLinks(
      [{ id: 'row-1', scopeId: 'c1', code: 'MONTHLY' }],
      catalogRows,
      [],
      legacyMap,
    );

    expect(plan).toEqual([
      { id: 'row-1', catalogId: 'cat-monthly', referenceCode: 'T01' },
    ]);
  });

  it('ข้ามแถวที่รหัสไม่มีคู่ — ถือว่าบริษัทสร้างเอง', () => {
    const plan = planLinks(
      [{ id: 'row-1', scopeId: 'c1', code: 'MY_OWN_TYPE' }],
      catalogRows,
      [],
      legacyMap,
    );

    expect(plan).toEqual([]);
  });

  it('ไม่ผูกซ้อนเมื่อบริษัทนั้นมีแถวอื่นจอง catalog เดียวกันไปแล้ว', () => {
    const plan = planLinks(
      [{ id: 'row-2', scopeId: 'c1', code: 'MONTHLY' }],
      catalogRows,
      [{ scopeId: 'c1', catalogId: 'cat-monthly' }],
      legacyMap,
    );

    expect(plan).toEqual([]);
  });

  it('บริษัทคนละแห่งผูก catalog เดียวกันได้ ไม่ชนกัน', () => {
    const plan = planLinks(
      [{ id: 'row-2', scopeId: 'c2', code: 'MONTHLY' }],
      catalogRows,
      [{ scopeId: 'c1', catalogId: 'cat-monthly' }],
      legacyMap,
    );

    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe('row-2');
  });

  it('สองแถวรหัสเดียวกันในบริษัทเดียว ผูกได้แค่ใบแรก', () => {
    const plan = planLinks(
      [
        { id: 'row-1', scopeId: 'c1', code: 'MONTHLY' },
        { id: 'row-2', scopeId: 'c1', code: 'monthly' },
      ],
      catalogRows,
      [],
      legacyMap,
    );

    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe('row-1');
  });
});
