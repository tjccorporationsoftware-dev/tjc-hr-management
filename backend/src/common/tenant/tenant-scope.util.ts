import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { TenantScope } from '../interfaces/authenticated-user.interface';

type ScopeFields = {
  companyField?: string;
  branchField?: string;
};

type TenantWhereValue = string | null;
type TenantWhereInput = Record<string, TenantWhereValue>;
type TenantRelationWhereInput = Record<string, { is: TenantWhereInput }>;

/**
 * คืน where-fragment สำหรับตารางที่มี companyId / branchId โดยตรง
 * GLOBAL  -> {}
 * COMPANY -> { companyId }
 * BRANCH  -> { companyId, branchId }
 */
export function tenantWhere(
  scope: TenantScope,
  fields: ScopeFields = {},
): TenantWhereInput {
  const companyField = fields.companyField ?? 'companyId';
  const branchField = fields.branchField ?? 'branchId';

  if (scope.level === 'GLOBAL') {
    return {};
  }

  if (scope.level === 'COMPANY') {
    return { [companyField]: scope.companyId };
  }

  return {
    [companyField]: scope.companyId,
    [branchField]: scope.branchId,
  };
}

/**
 * สำหรับตารางที่ scope ผ่าน relation เช่น { employee: { is: { companyId, branchId } } }
 */
export function tenantWhereVia(
  relation: string,
  scope: TenantScope,
  fields: ScopeFields = {},
): TenantRelationWhereInput | Record<string, never> {
  const inner = tenantWhere(scope, fields);

  return Object.keys(inner).length ? { [relation]: { is: inner } } : {};
}

/**
 * ตรวจว่า companyId / branchId ที่ client ส่งมาอยู่ภายใน scope ของผู้ใช้หรือไม่
 */
export function assertWithinScope(
  scope: TenantScope,
  target: { companyId?: string | null; branchId?: string | null },
) {
  if (scope.level === 'GLOBAL') {
    return;
  }

  if (target.companyId && target.companyId !== scope.companyId) {
    throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของบริษัทนี้');
  }

  if (
    scope.level === 'BRANCH' &&
    target.branchId &&
    target.branchId !== scope.branchId
  ) {
    throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้');
  }
}

/**
 * กันการ "เขียน" ข้อมูลที่ผูกกับสาขา สำหรับบัญชีระดับสาขา
 *
 * ทำไมต้องมีตัวนี้แยกจาก assertWithinScope:
 * assertWithinScope ตั้งใจปล่อยผ่านเมื่อ branchId เป็น null เพราะ read path
 * ต้องอ่านค่ากลางของบริษัทได้ (เช่น สาขาอ่านนโยบายมาตรฐานบริษัทมาใช้)
 * แต่ write path ปล่อยไม่ได้ ไม่งั้นบัญชีสาขาเดียวจะแก้ค่ากลางที่กระทบทุกสาขา
 * รวมสาขาที่ตัวเองไม่มีสิทธิ์ด้วย
 *
 * @param branchId ขอบเขตของข้อมูลที่กำลังจะเขียน (null = ระดับบริษัท)
 * @param subject  ชื่อสิ่งที่กำลังแก้ ใช้ประกอบข้อความ error
 */
export function assertBranchScopedWrite(
  scope: TenantScope,
  branchId: string | null | undefined,
  subject = 'ข้อมูล',
) {
  if (scope.level !== 'BRANCH') {
    return;
  }

  if (!branchId) {
    throw new ForbiddenException(
      `บัญชีระดับสาขาไม่มีสิทธิ์แก้${subject} ระดับบริษัท`,
    );
  }

  if (branchId !== scope.branchId) {
    throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้');
  }
}

/**
 * สำหรับข้อมูลที่ "ระดับบริษัทเท่านั้นที่จัดการได้" บัญชีระดับสาขาดูได้อย่างเดียว
 *
 * ต่างจาก assertBranchScopedWrite ตรงที่ตัวนั้นยอมให้สาขาแก้ของสาขาตัวเองได้
 * แต่ตัวนี้ห้ามบัญชีระดับสาขาเขียนทุกกรณี ใช้กับเรื่องที่ต้องคุมให้เป็นมาตรฐานเดียว
 * ทั้งบริษัท เช่น สิทธิ์การลา และอัตรา OT
 */
export function assertCompanyLevelWrite(
  scope: TenantScope,
  subject = 'ข้อมูลนี้',
) {
  if (scope.level === 'BRANCH') {
    throw new ForbiddenException(
      `${subject} ต้องให้ผู้ดูแลระดับบริษัทเป็นผู้จัดการ บัญชีระดับสาขาดูได้อย่างเดียว`,
    );
  }
}

/**
 * คืน companyId ที่ระบบจะใช้จริงตาม scope
 * GLOBAL เลือกกรองเองได้ แต่ COMPANY/BRANCH จะถูกล็อกไว้ตาม scope
 *
 * เดิมคืน undefined เมื่อบัญชีที่ไม่ใช่ GLOBAL ไม่มี companyId ซึ่งแปลว่า
 * "ไม่กรองอะไรเลย" — บัญชีที่ตั้งค่าไม่ครบจึงเห็นข้อมูลของทุกบริษัท
 * ตรงข้ามกับ tenantWhere ที่กรณีเดียวกันจะกรองจนไม่เหลือข้อมูล
 *
 * ค่าที่หายไปต้องแปลว่า "ไม่ให้ผ่าน" ไม่ใช่ "ให้ผ่านทั้งหมด"
 */
export function effectiveCompanyId(
  scope: TenantScope,
  requested?: string | null,
) {
  if (scope.level === 'GLOBAL') {
    return requested ?? undefined;
  }

  if (!scope.companyId) {
    throw new ForbiddenException(
      'บัญชีของคุณยังไม่ได้ผูกกับบริษัทใด กรุณาให้ผู้ดูแลระบบกำหนดขอบเขตก่อนใช้งาน',
    );
  }

  return scope.companyId;
}

/**
 * คืน branchId ที่ระบบจะใช้จริงตาม scope
 *
 * คู่กับ effectiveCompanyId — ตัวนั้นล็อกแค่ระดับบริษัท ถ้าใช้ตัวเดียว
 * บัญชีระดับสาขาจะส่ง branchId ของสาขาอื่นเข้ามาแล้วดูข้ามสาขาได้
 *
 * GLOBAL/COMPANY เลือกกรองเองได้ ส่วน BRANCH ถูกล็อกไว้ในสาขาของตัวเองเสมอ
 * ไม่ว่า client จะส่งค่าอะไรมา
 */
export function effectiveBranchId(
  scope: TenantScope,
  requested?: string | null,
) {
  if (scope.level !== 'BRANCH') {
    return requested ?? undefined;
  }

  if (!scope.branchId) {
    throw new ForbiddenException(
      'บัญชีของคุณยังไม่ได้ผูกกับสาขาใด กรุณาให้ผู้ดูแลระบบกำหนดขอบเขตก่อนใช้งาน',
    );
  }

  return scope.branchId;
}

/**
 * คืน companyId ที่ต้องใช้จริงสำหรับการ "สร้าง" ข้อมูลของบริษัท
 * - GLOBAL: ต้องระบุ companyId มา (เลือกบริษัทปลายทางเอง)
 * - COMPANY/BRANCH: ล็อกเป็นบริษัทของผู้ใช้เสมอ (ไม่เชื่อค่าจาก client)
 * โยน BadRequest ถ้าไม่มี companyId ให้ใช้
 */
export function requireCompanyId(
  scope: TenantScope,
  requested?: string | null,
): string {
  if (scope.level === 'GLOBAL') {
    if (!requested) {
      throw new BadRequestException('กรุณาระบุบริษัทปลายทาง');
    }
    return requested;
  }

  if (!scope.companyId) {
    throw new BadRequestException('บัญชีของคุณไม่ได้ผูกกับบริษัทใด');
  }
  return scope.companyId;
}

export type ScopeAssignmentInput = {
  level?: 'GLOBAL' | 'COMPANY' | 'BRANCH' | null;
  companyId?: string | null;
  branchId?: string | null;
};

/**
 * ตรวจความถูกต้องของ scope ที่จะกำหนดให้ user (ตาม constraint ระดับ):
 * GLOBAL  -> ห้ามมี company/branch
 * COMPANY -> ต้องมี company, ห้ามมี branch
 * BRANCH  -> ต้องมีทั้ง company และ branch
 * คืนค่า TenantScope ที่ normalize แล้ว
 *
 */
export function normalizeScopeAssignment(
  input: ScopeAssignmentInput,
): TenantScope {
  const level = input.level ?? 'BRANCH';
  const companyId = input.companyId ?? null;
  const branchId = input.branchId ?? null;

  if (level === 'GLOBAL') {
    if (companyId || branchId) {
      throw new BadRequestException('GLOBAL scope ต้องไม่มีบริษัท/สาขา');
    }
    return { level, companyId: null, branchId: null };
  }

  if (level === 'COMPANY') {
    if (!companyId) {
      throw new BadRequestException('COMPANY scope ต้องระบุบริษัท');
    }
    if (branchId) {
      throw new BadRequestException('COMPANY scope ต้องไม่ระบุสาขา');
    }
    return { level, companyId, branchId: null };
  }

  // BRANCH
  if (!companyId || !branchId) {
    throw new BadRequestException('BRANCH scope ต้องระบุทั้งบริษัทและสาขา');
  }
  return { level, companyId, branchId };
}

/**
 * บังคับลำดับชั้นการกำหนด scope ให้ user อื่น:
 * GLOBAL  -> กำหนดได้ทุก scope
 * COMPANY -> กำหนดได้เฉพาะ COMPANY/BRANCH ในบริษัทของตน
 * BRANCH  -> กำหนด scope ให้ผู้อื่นไม่ได้
 */
export function assertCanManageScope(actor: TenantScope, target: TenantScope) {
  if (actor.level === 'GLOBAL') {
    return;
  }

  if (actor.level === 'COMPANY') {
    if (target.level === 'GLOBAL') {
      throw new ForbiddenException('ไม่มีสิทธิ์สร้างผู้ใช้ระดับ GLOBAL');
    }
    if (target.companyId !== actor.companyId) {
      throw new ForbiddenException('กำหนดผู้ใช้ให้บริษัทอื่นไม่ได้');
    }
    return;
  }

  throw new ForbiddenException('บัญชีของคุณไม่มีสิทธิ์กำหนดขอบเขตผู้ใช้');
}
