import { EmployeeTransfersService } from './employee-transfers.service';
import type { EmployeesService } from '../employees/employees.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * การทำใบโยกย้ายให้มีผล
 * -----------------------------------------------------------------------------
 * ส่วนนี้เขียนทับทะเบียนพนักงานจริงโดยไม่มีคนกดยืนยันอีกรอบ (ตัวจับเวลาเรียกเอง
 * ตอนตีหนึ่งครึ่ง) จุดพลาดจึงไม่มีใครเห็นจนกว่าจะไปโผล่ที่งวดเงินเดือน
 *
 * สามอย่างที่ต้องไม่พลาด:
 *   1) แตะเฉพาะช่องที่ใบตั้งใจเปลี่ยน — ของที่ HR แก้ด้วยมือระหว่างรอต้องไม่ถูกย้อน
 *   2) จองใบก่อนทำ — หลาย instance ไล่ใบค้างพร้อมกันตอนบูตต้องไม่ได้ประวัติซ้ำ
 */

type TxCapture = {
  employeeUpdateData: Record<string, unknown> | null;
  workHistoryData: Record<string, unknown> | null;
  claimWhere: Record<string, unknown> | null;
};

type Loose = Record<string, unknown>;

const EMPLOYEE: Loose = {
  id: 'emp-1',
  companyId: 'com-1',
  branchId: 'br-old',
  departmentId: 'dep-old',
  divisionId: 'div-old',
  positionId: 'pos-old',
  position: 'พนักงานทั่วไป',
  employeeTypeId: 'type-1',
  supervisorId: 'sup-1',
  status: 'ACTIVE',
  deletedAt: null,
};

/** ใบที่ตั้งใจเปลี่ยนเฉพาะสาขา ช่องอื่น from เท่ากับ to (แปลว่าไม่แตะ) */
const TRANSFER: Loose = {
  id: 't-1',
  status: 'SCHEDULED',
  type: 'BRANCH_TRANSFER',
  effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
  documentNo: 'คำสั่งที่ 1/2569',
  reason: 'ขยายสาขาใหม่',
  createdById: 'user-1',

  fromBranchId: 'br-old',
  toBranchId: 'br-new',
  fromDepartmentId: 'dep-old',
  toDepartmentId: 'dep-old',
  fromDivisionId: 'div-old',
  toDivisionId: 'div-old',
  fromPositionId: 'pos-old',
  toPositionId: 'pos-old',
  fromPositionTitle: 'พนักงานทั่วไป',
  toPositionTitle: 'พนักงานทั่วไป',
  fromEmployeeTypeId: 'type-1',
  toEmployeeTypeId: 'type-1',
  fromSupervisorId: 'sup-1',
  toSupervisorId: 'sup-1',
};

function buildService(overrides?: {
  transfer?: Loose;
  employee?: Loose;
  claimCount?: number;
}) {
  const capture: TxCapture = {
    employeeUpdateData: null,
    workHistoryData: null,
    claimWhere: null,
  };

  const transfer = { ...TRANSFER, ...overrides?.transfer };
  const employee = { ...EMPLOYEE, ...overrides?.employee };
  const claimCount = overrides?.claimCount ?? 1;

  const tx = {
    employeeTransfer: {
      updateMany: jest.fn((args: { where: Record<string, unknown> }) => {
        capture.claimWhere = args.where;
        return Promise.resolve({ count: claimCount });
      }),
      findUnique: jest.fn(() =>
        Promise.resolve({ ...transfer, employee }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    employee: {
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        capture.employeeUpdateData = args.data;
        // จำลองผลหลังอัปเดต: ค่าที่ส่งไปทับของเดิม
        return Promise.resolve({ ...employee, ...args.data });
      }),
    },
    employeeWorkHistory: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        capture.workHistoryData = args.data;
        return Promise.resolve({ id: 'hist-1' });
      }),
    },
    position: {
      findUnique: jest.fn(() => Promise.resolve({ nameTh: 'ผู้จัดการสาขา' })),
    },
  };

  const prisma = {
    employeeTransfer: {
      findMany: jest.fn(() => Promise.resolve([{ id: transfer.id }])),
    },
    $transaction: jest.fn((callback: (client: unknown) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;

  const employeesService = {} as EmployeesService;

  return {
    service: new EmployeeTransfersService(prisma, employeesService),
    capture,
    tx,
  };
}

describe('EmployeeTransfersService · ทำใบให้มีผล', () => {
  it('แตะเฉพาะช่องที่ใบตั้งใจเปลี่ยน — ค่าที่ HR แก้ด้วยมือระหว่างรอต้องไม่ถูกย้อนกลับ', async () => {
    /*
     * ใบสั่งย้ายสาขาอย่างเดียว แต่ระหว่างรอถึงวัน มีคนแก้แผนกกับหัวหน้าด้วยมือ
     * ถ้าเขียนทับด้วยค่า to* ทุกช่อง การแก้ด้วยมือจะถูกย้อนกลับเงียบ ๆ
     */
    const { service, capture } = buildService({
      employee: { departmentId: 'dep-แก้มือ', supervisorId: 'sup-แก้มือ' },
    });

    await service.applyDueTransfers();

    expect(capture.employeeUpdateData).toMatchObject({
      branchId: 'br-new',
      departmentId: 'dep-แก้มือ',
      supervisorId: 'sup-แก้มือ',
    });
  });

  it('ช่องที่ตั้งใจถอดออก (ปลายทางเป็นค่าว่าง) ต้องถอดได้จริง', async () => {
    const { service, capture } = buildService({
      transfer: { fromDivisionId: 'div-old', toDivisionId: null },
    });

    await service.applyDueTransfers();

    expect(capture.employeeUpdateData?.divisionId).toBeNull();
  });

  it('เปลี่ยนตำแหน่งแล้วชื่อตำแหน่งต้องมาจากทะเบียน ไม่ใช่ค้างชื่อเดิม', async () => {
    const { service, capture } = buildService({
      transfer: {
        fromPositionId: 'pos-old',
        toPositionId: 'pos-new',
        type: 'POSITION_CHANGE',
      },
    });

    await service.applyDueTransfers();

    expect(capture.employeeUpdateData).toMatchObject({
      positionId: 'pos-new',
      position: 'ผู้จัดการสาขา',
    });
  });

  it('จองใบก่อนเสมอ และใบที่ถูกคนอื่นจองไปแล้วต้องไม่ถูกทำซ้ำ', async () => {
    const { service, capture, tx } = buildService({ claimCount: 0 });

    await service.applyDueTransfers();

    // เงื่อนไขการจองต้องผูกกับสถานะ ไม่ใช่จองด้วย id อย่างเดียว
    expect(capture.claimWhere).toMatchObject({
      id: 't-1',
      status: 'SCHEDULED',
    });
    // จองไม่ได้ = ไม่แตะทะเบียนพนักงานและไม่สร้างประวัติซ้ำ
    expect(tx.employee.update).not.toHaveBeenCalled();
    expect(tx.employeeWorkHistory.create).not.toHaveBeenCalled();
  });

  it('ประวัติการทำงานบันทึกวันที่มีผลตามใบ ไม่ใช่วันที่ระบบรัน', async () => {
    const { service, capture } = buildService();

    await service.applyDueTransfers();

    expect(capture.workHistoryData).toMatchObject({
      employeeId: 'emp-1',
      type: 'BRANCH_TRANSFER',
      effectiveDate: TRANSFER.effectiveDate,
      oldBranchId: 'br-old',
      newBranchId: 'br-new',
      createdById: 'user-1',
    });
    expect(capture.workHistoryData?.description).toBe(
      'คำสั่งเลขที่ คำสั่งที่ 1/2569 — ขยายสาขาใหม่',
    );
  });

  it('พนักงานที่ถูกลบไปแล้ว ต้องไม่ถูกเขียนทับ', async () => {
    const { service, tx } = buildService({
      employee: { deletedAt: new Date('2026-08-01T00:00:00.000Z') },
    });

    const result = await service.applyDueTransfers();

    expect(tx.employee.update).not.toHaveBeenCalled();
    // ใบที่ล้มต้องถูกรายงานออกมา ไม่ใช่เงียบหาย
    expect(result.failed).toEqual(['t-1']);
    expect(result.applied).toBe(0);
  });
});
