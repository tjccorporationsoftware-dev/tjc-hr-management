import { LeaveBalancesService } from './leave-balances.service';

/**
 * สร้างยอดวันลา — ต้องไม่สร้างให้ประเภทที่พนักงานยื่นไม่ได้
 * -----------------------------------------------------------------------------
 * เคสที่ลูกค้าเจอเอง (2569-08-19)
 *
 * genderEligibility ถูกตรวจแค่ตอน "ยื่นใบลา" (assertEligible) ไม่ได้ตรวจตอน
 * "สร้างยอด" ผลคือพนักงานชายมีโควตาลาคลอด 60 วันขึ้นมาในระบบ 32 แถว
 * ยื่นจริงไม่ได้เพราะโดนปฏิเสธ แต่ไปโป่งอยู่ในยอดรวมทั้งบริษัท
 * ทำให้ HR อ่านตัวเลข "วันลาคงเหลือ" ผิดโดยไม่มีอะไรเตือน
 */
describe('LeaveBalancesService · สร้างยอดตามเพศ', () => {
  const leaveTypes = {
    annual: {
      id: 'lt-annual',
      genderEligibility: 'ALL',
      deductQuota: true,
    },
    maternity: {
      id: 'lt-maternity',
      genderEligibility: 'FEMALE',
      deductQuota: true,
    },
    ordination: {
      id: 'lt-ordination',
      genderEligibility: 'MALE',
      deductQuota: true,
    },
  };

  /** คืน id ของประเภทลาที่ถูกสร้างยอดให้จริง */
  async function generateFor(gender: string | null) {
    const created: string[] = [];

    const prisma = {
      employee: {
        findFirst: jest.fn(async () => ({
          id: 'emp-1',
          companyId: 'company-1',
          branchId: null,
          employeeTypeId: 'type-1',
          startDate: new Date(2020, 0, 1),
          probationPassedAt: new Date(2020, 3, 1),
          profile: gender === null ? null : { gender },
        })),
      },
      leavePolicy: {
        findMany: jest.fn(async () =>
          Object.values(leaveTypes).map((leaveType) => ({
            id: `policy-${leaveType.id}`,
            leaveTypeId: leaveType.id,
            employeeTypeId: 'type-1',
            branchId: null,
            annualQuotaDays: 10,
            leaveType,
            quotaTiers: [],
          })),
        ),
      },
      leaveType: {
        findUnique: jest.fn(async () => ({ deductQuota: true })),
      },
      leaveRequest: {
        groupBy: jest.fn(async () => []),
      },
      leaveBalance: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: { leaveTypeId: string } }) => {
          created.push(data.leaveTypeId);
          return { id: `balance-${data.leaveTypeId}` };
        }),
        findMany: jest.fn(async () => []),
      },
    };

    const resolver = {
      resolveQuotaDays: jest.fn(() => ({ quotaDays: 10 })),
    };

    const service = new LeaveBalancesService(
      prisma as never,
      resolver as never,
    );

    await service.generateForEmployee({ employeeId: 'emp-1' }, false);

    return created;
  }

  it('พนักงานชาย ต้องไม่ได้โควตาลาคลอด', async () => {
    const created = await generateFor('MALE');

    expect(created).toContain('lt-annual');
    expect(created).toContain('lt-ordination');
    expect(created).not.toContain('lt-maternity');
  });

  it('พนักงานหญิง ต้องไม่ได้โควตาลาอุปสมบท', async () => {
    const created = await generateFor('FEMALE');

    expect(created).toContain('lt-annual');
    expect(created).toContain('lt-maternity');
    expect(created).not.toContain('lt-ordination');
  });

  /*
   * ยังไม่ได้บันทึกเพศ ก็ต้องข้ามเหมือนกัน
   * เพราะ assertEligible ปฏิเสธเช่นกัน การมียอดที่ยื่นไม่ได้จริงคือตัวเลขหลอกตา
   */
  it('ยังไม่ได้บันทึกเพศ ได้เฉพาะประเภทที่ไม่จำกัดเพศ', async () => {
    const created = await generateFor(null);

    expect(created).toEqual(['lt-annual']);
  });
});
