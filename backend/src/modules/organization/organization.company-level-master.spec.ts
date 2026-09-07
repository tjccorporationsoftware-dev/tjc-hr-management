import { OrganizationService } from './organization.service';

/**
 * ตำแหน่งและประเภทพนักงานเป็นข้อมูลระดับบริษัท
 *
 * เคสที่เคยพังจริง: บริษัทเปิดใหม่ยังไม่มีพนักงานเลย สร้างตำแหน่งแล้วรายการว่าง
 * เพราะโค้ดกรองด้วย "มีพนักงานถืออยู่" ซึ่งกลายเป็นทางตัน
 * (ต้องมีตำแหน่งก่อนจึงจะเพิ่มพนักงานได้ แต่ต้องมีพนักงานก่อนจึงจะเห็นตำแหน่ง)
 */
describe('OrganizationService · ขอบเขตข้อมูลหลักระดับบริษัท', () => {
  // เทสนี้แตะแค่ตัวสร้างเงื่อนไข where จึงไม่ต้องมี dependency จริง
  const service = new OrganizationService(null as never, null as never);
  const buildWhere = (params: Record<string, string | undefined>) =>
    (
      service as unknown as {
        buildCompanyLevelMasterWhere: (p: unknown) => Record<string, unknown>;
      }
    ).buildCompanyLevelMasterWhere(params);

  it('กรองด้วย companyId ตรงๆ ไม่ผูกกับการมีพนักงาน', () => {
    expect(buildWhere({ companyId: 'company-1' })).toEqual({
      companyId: 'company-1',
    });
  });

  it('เลือกสาขาแล้วต้องยังเห็นตำแหน่งของทั้งบริษัท ไม่ถูกตัดด้วยสาขา', () => {
    expect(buildWhere({ companyId: 'company-1', branchId: 'branch-1' })).toEqual(
      { companyId: 'company-1' },
    );
  });

  it('ถ้ามีแต่ branchId ให้สืบบริษัทจากสาขานั้น', () => {
    expect(buildWhere({ branchId: 'branch-1' })).toEqual({
      company: { branches: { some: { id: 'branch-1', deletedAt: null } } },
    });
  });

  it('ถ้ามีแต่ departmentId ให้สืบบริษัทจากแผนกนั้น', () => {
    expect(buildWhere({ departmentId: 'dept-1' })).toEqual({
      company: { departments: { some: { id: 'dept-1', deletedAt: null } } },
    });
  });

  it('ไม่ระบุขอบเขตเลย ให้เห็นทั้งหมด (ผู้ใช้ระดับ GLOBAL)', () => {
    expect(buildWhere({})).toEqual({});
  });
});
