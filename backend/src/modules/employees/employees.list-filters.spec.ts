import { EmployeesService } from './employees.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * ตัวกรองสถานะของทะเบียนพนักงาน
 *
 * หน้าเว็บเปิดมาโดยกรองเฉพาะคนที่ปฏิบัติงานอยู่ ตัวเลขสรุปหัวตารางจึงต้องไม่เดิน
 * ตามตัวกรองนั้น ไม่อย่างนั้นช่อง "พนักงานทั้งหมด" จะเท่ากับจำนวนคนที่ปฏิบัติงาน
 * และช่องลาออกจะเป็น 0 เสมอ
 */
type CapturedWhere = Record<string, unknown>;

function createService() {
  const listWheres: CapturedWhere[] = [];
  const countWheres: CapturedWhere[] = [];
  const groupByWheres: CapturedWhere[] = [];

  const prisma = {
    employee: {
      findMany: async ({ where }: { where: CapturedWhere }) => {
        listWheres.push(where);
        return [];
      },
      count: async ({ where }: { where: CapturedWhere }) => {
        countWheres.push(where);
        return 0;
      },
      // ตัวนับจำนวนคนต่อสาขา/แผนก ที่หัวข้อกลุ่มบนหน้าเว็บใช้
      groupBy: async ({ where }: { where: CapturedWhere }) => {
        groupByWheres.push(where);
        return [];
      },
    },
  };

  const service = new EmployeesService(prisma as never, {} as never);

  return { countWheres, groupByWheres, listWheres, service };
}

const ACTOR: Pick<AuthenticatedUser, 'id' | 'scope'> & {
  permissions: string[];
} = {
  id: 'user-1',
  permissions: ['HR_WORKSPACE'],
  scope: { level: 'COMPANY', companyId: 'company-1', branchId: null },
};

function flatten(where: CapturedWhere): CapturedWhere[] {
  const conditions = (where.AND ?? []) as CapturedWhere[];

  return conditions.flatMap((condition) =>
    condition.AND ? flatten(condition) : [condition],
  );
}

function hasStatusCondition(where: CapturedWhere) {
  return flatten(where).some((condition) => 'status' in condition);
}

describe('EmployeesService.findAll — ตัวกรองสถานะ', () => {
  it('กรองรายการตามสถานะที่ขอมา', async () => {
    const { listWheres, service } = createService();

    await service.findAll({ status: 'ACTIVE' } as never, ACTOR);

    /* findMany ตัวแรกคือรายการในตาราง ที่เหลือเป็นของบล็อกสรุป */
    expect(hasStatusCondition(listWheres[0])).toBe(true);
  });

  it('ไม่เอาตัวกรองสถานะไปคิดในตัวเลขสรุปหัวตาราง', async () => {
    const { countWheres, service } = createService();

    await service.findAll({ status: 'ACTIVE' } as never, ACTOR);

    /*
     * count ตัวแรกคือจำนวนแถวของตาราง (ตามตัวกรอง) ตัวที่สองคือ "ทั้งหมด" ของสรุป
     * ซึ่งต้องไม่มีเงื่อนไขสถานะติดไปด้วย
     */
    expect(hasStatusCondition(countWheres[0])).toBe(true);
    expect(hasStatusCondition(countWheres[1])).toBe(false);
  });

  it('ยังนับตัวกรองอื่นในตัวเลขสรุปตามเดิม', async () => {
    const { countWheres, service } = createService();

    await service.findAll(
      { departmentId: 'dept-1', status: 'ACTIVE' } as never,
      ACTOR,
    );

    const summaryTotalWhere = flatten(countWheres[1]);

    expect(
      summaryTotalWhere.some(
        (condition) => condition.departmentId === 'dept-1',
      ),
    ).toBe(true);
  });
});

/**
 * ค่าเริ่มต้นของทะเบียนพนักงาน = เฉพาะคนที่ยังทำงานอยู่
 *
 * ทะเบียนถูกเปิดเพื่อดูคนที่ทำงานอยู่เป็นหลัก คนที่พ้นสภาพไปแล้วปนอยู่ในรายการ
 * ทำให้กวาดตาหาคนยาก และจำนวนต่อกลุ่มก็อ่านแล้วเข้าใจผิด
 * ถ้าตรรกะตรงนี้พลาดจะเงียบมาก — รายการยังขึ้นครบ ดูเหมือนไม่มีอะไรผิด
 */
describe('EmployeesService.findAll — ค่าเริ่มต้นตัดคนที่พ้นสภาพ', () => {
  /** ดึงเงื่อนไขสถานะออกมาจาก where ที่ถูกส่งเข้า Prisma จริง */
  function statusConditions(where: CapturedWhere) {
    return flatten(where)
      .filter((condition) => 'status' in condition)
      .map((condition) => condition.status);
  }

  it('ไม่ระบุสถานะ = ตัดลาออก/เลิกจ้าง/ปิดใช้งานออกจากรายการ', async () => {
    const { listWheres, service } = createService();

    await service.findAll({} as never, ACTOR);

    expect(statusConditions(listWheres[0])).toEqual([
      { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
    ]);
  });

  it('กด "ทุกสถานะ" = ไม่กรองสถานะเลย', async () => {
    const { listWheres, service } = createService();

    await service.findAll({ includeFormerEmployees: true } as never, ACTOR);

    expect(hasStatusCondition(listWheres[0])).toBe(false);
  });

  it('เลือกสถานะเจาะจงชนะเสมอ — เลือก "ลาออก" ต้องได้คนลาออก', async () => {
    const { listWheres, service } = createService();

    await service.findAll({ status: 'RESIGNED' } as never, ACTOR);

    expect(statusConditions(listWheres[0])).toEqual(['RESIGNED']);
  });

  it('ตัวเลขหัวกลุ่มต้องนับด้วยตัวกรองชุดเดียวกับแถวที่แสดง', async () => {
    const { groupByWheres, service } = createService();

    await service.findAll({} as never, ACTOR);

    /*
     * ถ้าไปนับด้วย where ของสรุปสถานะ (ซึ่งตั้งใจไม่กรองสถานะ)
     * หัวกลุ่มจะขึ้นจำนวนที่รวมคนลาออกไว้ ทั้งที่แถวข้างล่างไม่มีคนพวกนั้น
     */
    expect(statusConditions(groupByWheres[0])).toEqual([
      { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
    ]);
  });
});
