import { ApprovalMatrixResolverService } from './approval-matrix-resolver.service';

/**
 * การเลือก "เส้นทางอนุมัติ" ให้คำขอหนึ่งใบ
 *
 * ประเภทคำขอหนึ่งมีได้หลายเส้นขนานกัน (ไม่ใช่ขั้นต่อกัน) เช่นใบลาของพนักงานทั่วไป
 * ให้ HR อนุมัติ แต่ของเลขาฯ กับผู้จัดการต้องขึ้นถึงผู้บริหาร — ใบหนึ่งต้องเดินเส้นเดียว
 * และต้องเป็นเส้นที่เจาะจงกับคนยื่นที่สุด
 *
 * เทสชุดนี้ล็อกกติกาการเลือกเส้นไว้ เพราะหน้าตั้งค่าสร้างสายซ้อนกันได้อิสระ
 * ถ้าลำดับความสำคัญเพี้ยนไป ใบจะไหลไปหาคนอนุมัติผิดคนแบบเงียบ ๆ
 */
type RoutingResolver = {
  findApplicableMatrix(
    tx: unknown,
    params: {
      targetType: string;
      employee: {
        id: string;
        companyId: string;
        branchId: string | null;
        departmentId: string | null;
        employeeTypeId: string | null;
      };
    },
  ): Promise<{ id: string } | null>;
};

type MatrixSeed = {
  id: string;
  priority?: number;
  branchId?: string | null;
  extraBranchIds?: string[];
  requesterIds?: string[];
  departmentId?: string | null;
  employeeTypeId?: string | null;
  hasSteps?: boolean;
};

describe('ApprovalMatrixResolverService · การเลือกเส้นทางอนุมัติ', () => {
  const service = Object.create(
    ApprovalMatrixResolverService.prototype,
  ) as unknown as RoutingResolver;

  const makeMatrix = (seed: MatrixSeed) => ({
    id: seed.id,
    priority: seed.priority ?? 1,
    createdAt: new Date('2026-01-01'),
    branchId: seed.branchId ?? null,
    departmentId: seed.departmentId ?? null,
    employeeTypeId: seed.employeeTypeId ?? null,
    requesters: (seed.requesterIds ?? []).map((employeeId) => ({ employeeId })),
    extraBranches: (seed.extraBranchIds ?? []).map((branchId) => ({ branchId })),
    steps:
      seed.hasSteps === false
        ? []
        : [{ id: `${seed.id}-step-1`, stepNo: 1, nameTh: 'ขั้นเดียว' }],
  });

  const makeTx = (matrices: ReturnType<typeof makeMatrix>[]) => ({
    approvalMatrix: { findMany: jest.fn().mockResolvedValue(matrices) },
  });

  const makeEmployee = (overrides: {
    id: string;
    branchId?: string | null;
    departmentId?: string | null;
    employeeTypeId?: string | null;
  }) => ({
    companyId: 'com-1',
    branchId: null,
    departmentId: null,
    employeeTypeId: null,
    ...overrides,
  });

  const resolve = async (
    matrices: ReturnType<typeof makeMatrix>[],
    employee: ReturnType<typeof makeEmployee>,
  ) =>
    service.findApplicableMatrix(makeTx(matrices), {
      targetType: 'LEAVE_REQUEST',
      employee,
    });

  it('มีเส้นรายชื่อเจาะจง → คนในรายชื่อเดินเส้นนั้น ไม่ใช่เส้นของพนักงานทุกคน', async () => {
    const matrices = [
      makeMatrix({ id: 'ทุกคน-hr' }),
      makeMatrix({ id: 'เลขาฯ-ผู้บริหาร', requesterIds: ['emp-secretary'] }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-secretary' })),
    ).resolves.toMatchObject({ id: 'เลขาฯ-ผู้บริหาร' });
  });

  it('คนที่ไม่อยู่ในรายชื่อยังเดินเส้นของพนักงานทุกคนเหมือนเดิม', async () => {
    const matrices = [
      makeMatrix({ id: 'ทุกคน-hr' }),
      makeMatrix({ id: 'เลขาฯ-ผู้บริหาร', requesterIds: ['emp-secretary'] }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-staff' })),
    ).resolves.toMatchObject({ id: 'ทุกคน-hr' });
  });

  it('สายเดียวครอบหลายสาขา → พนักงานของสาขาที่เพิ่มเข้ามาทีหลังก็เข้าเส้นนั้น', async () => {
    const matrices = [
      makeMatrix({ id: 'ทุกคน-hr' }),
      makeMatrix({
        id: 'สาขา-a-b',
        branchId: 'branch-a',
        extraBranchIds: ['branch-b'],
      }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-b', branchId: 'branch-b' })),
    ).resolves.toMatchObject({ id: 'สาขา-a-b' });
  });

  it('พนักงานสาขาที่ไม่ได้อยู่ในสายรายสาขา → ตกไปเส้นของพนักงานทุกคน', async () => {
    const matrices = [
      makeMatrix({ id: 'ทุกคน-hr' }),
      makeMatrix({
        id: 'สาขา-a-b',
        branchId: 'branch-a',
        extraBranchIds: ['branch-b'],
      }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-c', branchId: 'branch-c' })),
    ).resolves.toMatchObject({ id: 'ทุกคน-hr' });
  });

  it('เส้นรายชื่อชนะเส้นรายสาขาเมื่อ priority เท่ากัน (เจาะจงกว่า)', async () => {
    const matrices = [
      makeMatrix({ id: 'สาขา-a', branchId: 'branch-a' }),
      makeMatrix({ id: 'รายชื่อ', requesterIds: ['emp-1'] }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-1', branchId: 'branch-a' })),
    ).resolves.toMatchObject({ id: 'รายชื่อ' });
  });

  /*
   * กับดักที่หน้าตั้งค่ากันไว้ด้วยการตั้ง priority ให้เส้นใหม่เท่ากับเส้นที่แรงสุด
   * ถ้าเส้นเจาะจงมี priority มากกว่า (= อ่อนกว่า) จะถูกเส้นกว้างบังจนไม่ถูกใช้เลย
   */
  it('priority มาก่อนความเจาะจง — เส้นรายชื่อที่ priority อ่อนกว่าจะถูกบัง', async () => {
    const matrices = [
      makeMatrix({ id: 'ทุกคน-hr', priority: 1 }),
      makeMatrix({ id: 'รายชื่อ', priority: 5, requesterIds: ['emp-1'] }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-1' })),
    ).resolves.toMatchObject({ id: 'ทุกคน-hr' });
  });

  it('เส้นที่ยังไม่ได้กำหนดผู้อนุมัติถูกข้าม ไม่ถูกเลือกมาใช้', async () => {
    const matrices = [
      makeMatrix({ id: 'รายชื่อ-ว่าง', requesterIds: ['emp-1'], hasSteps: false }),
      makeMatrix({ id: 'ทุกคน-hr' }),
    ];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-1' })),
    ).resolves.toMatchObject({ id: 'ทุกคน-hr' });
  });

  it('ไม่มีเส้นไหนตรงเลย → คืน null ให้ผู้เรียกไปแจ้งผู้ใช้เอง', async () => {
    const matrices = [makeMatrix({ id: 'สาขา-a', branchId: 'branch-a' })];

    await expect(
      resolve(matrices, makeEmployee({ id: 'emp-x', branchId: 'branch-z' })),
    ).resolves.toBeNull();
  });
});
