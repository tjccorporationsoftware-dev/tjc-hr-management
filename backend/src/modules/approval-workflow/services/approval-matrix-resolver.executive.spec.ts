import { BadRequestException } from '@nestjs/common';
import { ApprovalMatrixResolverService } from './approval-matrix-resolver.service';

/**
 * ขั้นอนุมัติ "ผู้บริหาร" ต้องหาจากบทบาทก่อนระดับตำแหน่ง
 *
 * เดิมหาจาก Position.level <= 2 โดยไม่ตรวจบทบาทเลย บริษัทที่ตั้ง level กลับด้าน
 * (ระบบใช้ 1 = สูงสุด) จะมอบอำนาจอนุมัติให้พนักงานระดับล่างสุดแบบเงียบ ๆ
 */
type ExecutiveResolver = {
  resolveExecutiveApprover(
    tx: unknown,
    companyId: string,
    stepName: string,
  ): Promise<{ expectedApproverId: string; expectedEmployeeId: string | null }>;
};

describe('ApprovalMatrixResolverService · ผู้อนุมัติขั้นผู้บริหาร', () => {
  const service = Object.create(
    ApprovalMatrixResolverService.prototype,
  ) as unknown as ExecutiveResolver;

  const makeTx = (opts: { users?: unknown[]; employee?: unknown }) => ({
    user: { findMany: jest.fn().mockResolvedValue(opts.users ?? []) },
    employee: { findFirst: jest.fn().mockResolvedValue(opts.employee ?? null) },
  });

  it('มีผู้ใช้ที่ถือบทบาทผู้บริหาร → ใช้คนนั้น ไม่ต้องดูระดับตำแหน่ง', async () => {
    const tx = makeTx({
      users: [{ id: 'user-md', employee: { id: 'emp-md', companyId: 'com-1' } }],
      employee: { id: 'emp-junior', userId: 'user-junior' },
    });

    const result = await service.resolveExecutiveApprover(tx, 'com-1', 'ผู้บริหาร');

    expect(result.expectedApproverId).toBe('user-md');
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('ไม่มีใครถือบทบาท → ตกไปใช้ระดับตำแหน่ง โดยเรียงจากสูงสุดลงมา', async () => {
    const tx = makeTx({
      users: [],
      employee: { id: 'emp-md', userId: 'user-md' },
    });

    const result = await service.resolveExecutiveApprover(tx, 'com-1', 'ผู้บริหาร');

    expect(result).toEqual({
      expectedApproverId: 'user-md',
      expectedEmployeeId: 'emp-md',
    });

    const args = tx.employee.findFirst.mock.calls[0][0];
    expect(args.orderBy).toEqual([
      { positionMaster: { level: 'asc' } },
      { employeeCode: 'asc' },
    ]);
    expect(args.where.positionMaster.is.level).toEqual({ lte: 2 });
  });

  it('ไม่มีทั้งบทบาทและตำแหน่งระดับผู้บริหาร → ปฏิเสธพร้อมบอกวิธีแก้', async () => {
    const tx = makeTx({ users: [], employee: null });

    await expect(
      service.resolveExecutiveApprover(tx, 'com-1', 'ผู้บริหาร'),
    ).rejects.toThrow(BadRequestException);
  });
});
