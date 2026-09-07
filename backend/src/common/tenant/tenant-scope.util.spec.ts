import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { TenantScope } from '../interfaces/authenticated-user.interface';
import {
  assertBranchScopedWrite,
  assertCanManageScope,
  assertCompanyLevelWrite,
  assertWithinScope,
  effectiveBranchId,
  effectiveCompanyId,
  normalizeScopeAssignment,
  requireCompanyId,
  tenantWhere,
  tenantWhereVia,
} from './tenant-scope.util';

/**
 * ตัวกันข้อมูลข้ามบริษัทของทั้งระบบ
 * -----------------------------------------------------------------------------
 * ไฟล์นี้ถูกใช้ใน 40 ไฟล์ทั่วระบบ แต่เดิมไม่มีเทสเลยสักตัว
 * ถ้าตรรกะตรงนี้เพี้ยนไปแม้แต่นิดเดียว ข้อมูลบริษัทหนึ่งจะรั่วไปอีกบริษัททันที
 * โดยไม่มีอะไรเตือน เพราะทุกโมดูลเรียกใช้โดยเชื่อว่ามันถูก
 */

const globalScope: TenantScope = {
  level: 'GLOBAL',
  companyId: null,
  branchId: null,
};

const companyScope: TenantScope = {
  level: 'COMPANY',
  companyId: 'com-1',
  branchId: null,
};

const branchScope: TenantScope = {
  level: 'BRANCH',
  companyId: 'com-1',
  branchId: 'br-1',
};

describe('tenantWhere', () => {
  it('ระดับแพลตฟอร์มไม่กรองอะไร เห็นทุกบริษัท', () => {
    expect(tenantWhere(globalScope)).toEqual({});
  });

  it('ระดับบริษัทกรองด้วยบริษัท ไม่กรองสาขา', () => {
    expect(tenantWhere(companyScope)).toEqual({ companyId: 'com-1' });
  });

  it('ระดับสาขากรองทั้งบริษัทและสาขา', () => {
    expect(tenantWhere(branchScope)).toEqual({
      companyId: 'com-1',
      branchId: 'br-1',
    });
  });

  it('เปลี่ยนชื่อคอลัมน์ได้ สำหรับตารางที่ตั้งชื่อไม่เหมือนกัน', () => {
    expect(
      tenantWhere(branchScope, {
        companyField: 'ownerCompanyId',
        branchField: 'ownerBranchId',
      }),
    ).toEqual({ ownerCompanyId: 'com-1', ownerBranchId: 'br-1' });
  });
});

describe('tenantWhereVia', () => {
  it('ห่อเงื่อนไขไว้ใต้ relation ที่ระบุ', () => {
    expect(tenantWhereVia('employee', companyScope)).toEqual({
      employee: { is: { companyId: 'com-1' } },
    });
  });

  it('ระดับแพลตฟอร์มคืนอ็อบเจ็กต์ว่าง ไม่ใช่ relation ที่มีเงื่อนไขว่าง', () => {
    // ถ้าคืน { employee: { is: {} } } Prisma จะบังคับให้ต้องมี employee อยู่จริง
    // ซึ่งจะตัดแถวที่ employee เป็น null ออกไปโดยไม่ได้ตั้งใจ
    expect(tenantWhereVia('employee', globalScope)).toEqual({});
  });
});

describe('assertWithinScope', () => {
  it('ระดับแพลตฟอร์มเข้าถึงได้ทุกบริษัท', () => {
    expect(() =>
      assertWithinScope(globalScope, { companyId: 'com-9' }),
    ).not.toThrow();
  });

  it('เข้าถึงบริษัทอื่นไม่ได้', () => {
    expect(() =>
      assertWithinScope(companyScope, { companyId: 'com-9' }),
    ).toThrow(ForbiddenException);
  });

  it('เข้าถึงบริษัทตัวเองได้', () => {
    expect(() =>
      assertWithinScope(companyScope, { companyId: 'com-1' }),
    ).not.toThrow();
  });

  it('ระดับสาขาเข้าถึงสาขาอื่นไม่ได้', () => {
    expect(() =>
      assertWithinScope(branchScope, { companyId: 'com-1', branchId: 'br-9' }),
    ).toThrow(ForbiddenException);
  });

  it('ระดับบริษัทเข้าถึงได้ทุกสาขาในบริษัทตัวเอง', () => {
    expect(() =>
      assertWithinScope(companyScope, { companyId: 'com-1', branchId: 'br-9' }),
    ).not.toThrow();
  });

  it('ข้อมูลระดับบริษัท (ไม่ผูกสาขา) บัญชีสาขาอ่านได้', () => {
    // ตั้งใจปล่อยผ่าน เพราะสาขาต้องอ่านนโยบายกลางของบริษัทมาใช้ได้
    expect(() =>
      assertWithinScope(branchScope, { companyId: 'com-1', branchId: null }),
    ).not.toThrow();
  });
});

describe('assertBranchScopedWrite', () => {
  it('บัญชีสาขาแก้ค่ากลางของบริษัทไม่ได้', () => {
    // จุดที่ต่างจาก assertWithinScope — ตัวนั้นปล่อยผ่านเพื่อให้ "อ่าน" ได้
    // แต่ถ้าปล่อยให้ "เขียน" สาขาเดียวจะแก้ค่าที่กระทบทุกสาขา
    expect(() => assertBranchScopedWrite(branchScope, null)).toThrow(
      ForbiddenException,
    );
  });

  it('บัญชีสาขาแก้ของสาขาตัวเองได้', () => {
    expect(() => assertBranchScopedWrite(branchScope, 'br-1')).not.toThrow();
  });

  it('บัญชีสาขาแก้ของสาขาอื่นไม่ได้', () => {
    expect(() => assertBranchScopedWrite(branchScope, 'br-9')).toThrow(
      ForbiddenException,
    );
  });

  it('ระดับบริษัทและแพลตฟอร์มไม่ติดข้อจำกัดนี้', () => {
    expect(() => assertBranchScopedWrite(companyScope, null)).not.toThrow();
    expect(() => assertBranchScopedWrite(globalScope, null)).not.toThrow();
  });
});

describe('assertCompanyLevelWrite', () => {
  it('บัญชีสาขาเขียนไม่ได้ทุกกรณี', () => {
    expect(() => assertCompanyLevelWrite(branchScope)).toThrow(
      ForbiddenException,
    );
  });

  it('ระดับบริษัทและแพลตฟอร์มเขียนได้', () => {
    expect(() => assertCompanyLevelWrite(companyScope)).not.toThrow();
    expect(() => assertCompanyLevelWrite(globalScope)).not.toThrow();
  });
});

describe('effectiveCompanyId', () => {
  it('ระดับแพลตฟอร์มเลือกบริษัทที่จะดูได้เอง', () => {
    expect(effectiveCompanyId(globalScope, 'com-9')).toBe('com-9');
  });

  it('ระดับแพลตฟอร์มไม่เลือก = ไม่กรอง', () => {
    expect(effectiveCompanyId(globalScope)).toBeUndefined();
  });

  it('ระดับบริษัทถูกล็อกไว้ที่บริษัทตัวเอง แม้ส่งค่าอื่นมา', () => {
    // สำคัญ: ค่าจาก client ต้องถูกเมิน ไม่งั้นเปลี่ยน query string ก็ดูบริษัทอื่นได้
    expect(effectiveCompanyId(companyScope, 'com-9')).toBe('com-1');
    expect(effectiveCompanyId(branchScope, 'com-9')).toBe('com-1');
  });

  /*
   * เดิมคืน undefined ในกรณีนี้ ซึ่งปลายทางแปลว่า "ไม่ต้องกรอง"
   * บัญชีที่ตั้งค่าไม่ครบจึงเห็นข้อมูลของทุกบริษัทแทนที่จะไม่เห็นอะไรเลย
   * ค่าที่หายไปต้องแปลว่าไม่ให้ผ่าน ไม่ใช่ให้ผ่านทั้งหมด
   */
  it('บัญชีที่ยังไม่ผูกบริษัทต้องถูกปฏิเสธ ไม่ใช่เห็นทุกบริษัท', () => {
    const unresolved: TenantScope = {
      level: 'BRANCH',
      companyId: null,
      branchId: null,
    };

    expect(() => effectiveCompanyId(unresolved)).toThrow(ForbiddenException);
    expect(() => effectiveCompanyId(unresolved, 'com-9')).toThrow(
      ForbiddenException,
    );
  });
});

describe('effectiveBranchId', () => {
  it('ระดับแพลตฟอร์มและระดับบริษัทเลือกสาขาที่จะดูได้เอง', () => {
    expect(effectiveBranchId(globalScope, 'br-9')).toBe('br-9');
    expect(effectiveBranchId(companyScope, 'br-9')).toBe('br-9');
  });

  it('ไม่เลือกสาขา = ไม่กรองสาขา', () => {
    expect(effectiveBranchId(globalScope)).toBeUndefined();
    expect(effectiveBranchId(companyScope)).toBeUndefined();
  });

  /*
   * หัวใจของตัวนี้ — คู่กับ effectiveCompanyId ที่ล็อกแค่ระดับบริษัท
   * ถ้าใช้ตัวนั้นตัวเดียว บัญชีระดับสาขาส่ง branchId ของสาขาอื่นมาก็ดูข้ามสาขาได้
   */
  it('ระดับสาขาถูกล็อกไว้ที่สาขาตัวเอง แม้ส่งค่าอื่นมา', () => {
    expect(effectiveBranchId(branchScope, 'br-9')).toBe('br-1');
    expect(effectiveBranchId(branchScope)).toBe('br-1');
  });

  it('บัญชีระดับสาขาที่ยังไม่ผูกสาขาต้องถูกปฏิเสธ', () => {
    const unresolved: TenantScope = {
      level: 'BRANCH',
      companyId: 'com-1',
      branchId: null,
    };

    expect(() => effectiveBranchId(unresolved, 'br-9')).toThrow(
      ForbiddenException,
    );
  });
});

describe('requireCompanyId', () => {
  it('ระดับแพลตฟอร์มต้องระบุบริษัทปลายทาง', () => {
    expect(() => requireCompanyId(globalScope)).toThrow(BadRequestException);
    expect(requireCompanyId(globalScope, 'com-9')).toBe('com-9');
  });

  it('ระดับบริษัทถูกล็อกไว้ที่บริษัทตัวเอง แม้ส่งค่าอื่นมา', () => {
    expect(requireCompanyId(companyScope, 'com-9')).toBe('com-1');
  });

  it('บัญชีที่ไม่ผูกบริษัทเลย สร้างข้อมูลไม่ได้', () => {
    expect(() =>
      requireCompanyId({ level: 'COMPANY', companyId: null, branchId: null }),
    ).toThrow(BadRequestException);
  });
});

describe('normalizeScopeAssignment', () => {
  it('GLOBAL ต้องไม่มีบริษัท/สาขา', () => {
    expect(normalizeScopeAssignment({ level: 'GLOBAL' })).toEqual(globalScope);
    expect(() =>
      normalizeScopeAssignment({ level: 'GLOBAL', companyId: 'com-1' }),
    ).toThrow(BadRequestException);
  });

  it('COMPANY ต้องมีบริษัท และห้ามมีสาขา', () => {
    expect(
      normalizeScopeAssignment({ level: 'COMPANY', companyId: 'com-1' }),
    ).toEqual(companyScope);
    expect(() => normalizeScopeAssignment({ level: 'COMPANY' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeScopeAssignment({
        level: 'COMPANY',
        companyId: 'com-1',
        branchId: 'br-1',
      }),
    ).toThrow(BadRequestException);
  });

  it('BRANCH ต้องมีครบทั้งบริษัทและสาขา', () => {
    expect(
      normalizeScopeAssignment({
        level: 'BRANCH',
        companyId: 'com-1',
        branchId: 'br-1',
      }),
    ).toEqual(branchScope);
    expect(() =>
      normalizeScopeAssignment({ level: 'BRANCH', companyId: 'com-1' }),
    ).toThrow(BadRequestException);
  });

  it('ไม่ระบุระดับ ตกเป็น BRANCH ซึ่งเป็นระดับที่แคบที่สุด (fail-closed)', () => {
    expect(() => normalizeScopeAssignment({})).toThrow(BadRequestException);
  });
});

describe('assertCanManageScope', () => {
  it('ระดับแพลตฟอร์มกำหนดให้ใครก็ได้', () => {
    expect(() => assertCanManageScope(globalScope, globalScope)).not.toThrow();
    expect(() => assertCanManageScope(globalScope, branchScope)).not.toThrow();
  });

  it('ระดับบริษัทสร้างผู้ใช้ระดับแพลตฟอร์มไม่ได้ — ห้ามยกระดับตัวเอง', () => {
    expect(() => assertCanManageScope(companyScope, globalScope)).toThrow(
      ForbiddenException,
    );
  });

  it('ระดับบริษัทกำหนดให้บริษัทอื่นไม่ได้', () => {
    expect(() =>
      assertCanManageScope(companyScope, {
        level: 'COMPANY',
        companyId: 'com-9',
        branchId: null,
      }),
    ).toThrow(ForbiddenException);
  });

  it('ระดับบริษัทกำหนดให้คนในบริษัทตัวเองได้', () => {
    expect(() => assertCanManageScope(companyScope, branchScope)).not.toThrow();
  });

  it('ระดับสาขากำหนดขอบเขตให้ใครไม่ได้เลย', () => {
    expect(() => assertCanManageScope(branchScope, branchScope)).toThrow(
      ForbiddenException,
    );
  });
});
