import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { PermissionGuard } from './permission.guard';

/**
 * ตัวบังคับสิทธิ์ของทุก endpoint
 * -----------------------------------------------------------------------------
 * ทุก endpoint ที่ใช้ `@Auth(...)` หรือ `@RequirePermissions(...)` ผ่านตัวนี้
 * แต่เดิมไม่มีเทสเลย ถ้ามีใครแก้ให้ `.some()` แทน `.every()` ระบบจะยังทำงานปกติ
 * เทสอื่นก็ผ่านหมด แต่สิทธิ์แบบ "ต้องมีครบ" จะกลายเป็น "มีอันใดอันหนึ่งก็พอ" เงียบ ๆ
 */
describe('PermissionGuard', () => {
  function buildContext(user?: { permissions: string[] } | null) {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildGuard(requiredPermissions: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    } as unknown as Reflector;

    return new PermissionGuard(reflector);
  }

  it('endpoint ที่ไม่ระบุสิทธิ์ ผ่านได้เลย', () => {
    expect(buildGuard(undefined).canActivate(buildContext(null))).toBe(true);
    expect(buildGuard([]).canActivate(buildContext(null))).toBe(true);
  });

  it('ยังไม่ล็อกอิน แต่ endpoint ต้องใช้สิทธิ์ — ต้องเป็น 401 ไม่ใช่ 403', () => {
    // ต่างกันสำหรับฝั่งหน้าเว็บ: 401 = พาไปหน้าล็อกอิน · 403 = บอกว่าไม่มีสิทธิ์
    expect(() =>
      buildGuard(['EMPLOYEE_READ']).canActivate(buildContext(null)),
    ).toThrow(UnauthorizedException);
  });

  it('มีสิทธิ์ครบ ผ่าน', () => {
    const guard = buildGuard(['EMPLOYEE_READ', 'EMPLOYEE_UPDATE']);

    expect(
      guard.canActivate(
        buildContext({ permissions: ['EMPLOYEE_READ', 'EMPLOYEE_UPDATE'] }),
      ),
    ).toBe(true);
  });

  it('ต้องมีครบทุกสิทธิ์ ไม่ใช่มีอันใดอันหนึ่งก็พอ', () => {
    const guard = buildGuard(['EMPLOYEE_READ', 'EMPLOYEE_UPDATE']);

    expect(() =>
      guard.canActivate(buildContext({ permissions: ['EMPLOYEE_READ'] })),
    ).toThrow(ForbiddenException);
  });

  it('ไม่มีสิทธิ์ที่ต้องใช้เลย ถูกปฏิเสธ', () => {
    expect(() =>
      buildGuard(['PAYROLL_MANAGE']).canActivate(
        buildContext({ permissions: ['EMPLOYEE_READ'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('มีสิทธิ์อื่นเยอะแค่ไหนก็ไม่ช่วย ถ้าไม่มีตัวที่ต้องใช้', () => {
    expect(() =>
      buildGuard(['PAYROLL_MANAGE']).canActivate(
        buildContext({
          permissions: [
            'EMPLOYEE_READ',
            'EMPLOYEE_UPDATE',
            'LEAVE_APPROVE',
            'OT_APPROVE',
          ],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('ผู้ใช้ที่ไม่มีสิทธิ์อะไรเลย ถูกปฏิเสธ ไม่ใช่ผ่านเพราะรายการว่าง', () => {
    expect(() =>
      buildGuard(['EMPLOYEE_READ']).canActivate(buildContext({ permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('อ่านสิทธิ์จากทั้ง handler และ class — ระดับ method ต้องทับระดับ controller', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['EMPLOYEE_READ']),
    } as unknown as Reflector;

    new PermissionGuard(reflector).canActivate(
      buildContext({ permissions: ['EMPLOYEE_READ'] }),
    );

    const args = (reflector.getAllAndOverride as jest.Mock).mock.calls[0];

    // ต้องส่งทั้งสองระดับเข้าไป ไม่งั้น @Auth ที่ระดับ controller จะไม่มีผล
    expect(args[1]).toHaveLength(2);
  });
});
