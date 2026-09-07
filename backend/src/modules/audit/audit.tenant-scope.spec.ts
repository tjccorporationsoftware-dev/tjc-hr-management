import { AuditService } from './audit.service';

/**
 * บันทึกการใช้งาน (audit) ต้องแยกตามบริษัท
 *
 * เคสที่เคยพังจริง: ตาราง AuditLog ไม่มี companyId เลย และ endpoint ของ audit
 * ไม่มี tenant scope มีแค่สิทธิ์ ORG_MANAGE ผู้ดูแลของบริษัทหนึ่งจึงอ่านบันทึก
 * ของทุกบริษัทได้ รวมถึง path และ metadata ที่บอกว่าอีกบริษัททำอะไรอยู่
 *
 * การจะแยกได้ต้องเก็บ companyId ตอนที่เกิดเหตุ ไม่ใช่ไปสาวจาก User ทีหลัง
 * เพราะผู้ใช้ย้ายบริษัทหรือถูกลบได้ แล้วบันทึกเก่าจะถูกนับผิดบริษัท
 */
type ApplyScopeFn = (
  where: Record<string, unknown>,
  scope?: { level: string; companyId: string | null; branchId: string | null },
) => Record<string, unknown>;

function buildService() {
  const service = Object.create(AuditService.prototype) as AuditService;

  return (service as unknown as { applyScopeToAuditWhere: ApplyScopeFn })
    .applyScopeToAuditWhere.bind(service) as ApplyScopeFn;
}

describe('applyScopeToAuditWhere', () => {
  const baseWhere = { action: 'LOGIN' };

  it('ระดับแพลตฟอร์มเห็นได้ทุกบริษัท ไม่ใส่ตัวกรอง', () => {
    const applyScope = buildService();
    const result = applyScope(baseWhere, {
      level: 'GLOBAL',
      companyId: null,
      branchId: null,
    });

    expect(result).toEqual(baseWhere);
  });

  it('ระดับบริษัท เห็นเฉพาะบริษัทตัวเอง', () => {
    const applyScope = buildService();
    const result = applyScope(baseWhere, {
      level: 'COMPANY',
      companyId: 'com-1',
      branchId: null,
    });

    expect(result).toEqual({ action: 'LOGIN', companyId: 'com-1' });
  });

  it('ระดับสาขา ก็ยังจำกัดที่บริษัทของตัวเอง', () => {
    const applyScope = buildService();
    const result = applyScope(baseWhere, {
      level: 'BRANCH',
      companyId: 'com-1',
      branchId: 'br-1',
    });

    expect(result).toEqual({ action: 'LOGIN', companyId: 'com-1' });
  });

  it('ไม่ส่ง scope มา ไม่กรอง — ใช้กับงานภายในที่ไม่ได้มาจากคำขอของผู้ใช้', () => {
    const applyScope = buildService();

    expect(applyScope(baseWhere)).toEqual(baseWhere);
  });

  it('ไม่ทับเงื่อนไขเดิมที่มีอยู่แล้ว', () => {
    const applyScope = buildService();
    const result = applyScope(
      { action: 'LOGIN', statusCode: 401 },
      { level: 'COMPANY', companyId: 'com-1', branchId: null },
    );

    expect(result).toEqual({
      action: 'LOGIN',
      statusCode: 401,
      companyId: 'com-1',
    });
  });

  it('ไม่แก้อ็อบเจ็กต์ต้นฉบับ', () => {
    const applyScope = buildService();
    const where = { action: 'LOGIN' };

    applyScope(where, { level: 'COMPANY', companyId: 'com-1', branchId: null });

    expect(where).toEqual({ action: 'LOGIN' });
  });
});
