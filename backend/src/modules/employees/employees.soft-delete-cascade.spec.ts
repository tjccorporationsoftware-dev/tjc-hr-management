import { EmployeesService } from './employees.service';

/**
 * ลบพนักงานแล้วคำขอที่ยังค้างต้องถูกปิดตาม
 *
 * เคสที่เคยพังจริง: soft delete แตะแค่แถว employee อย่างเดียว
 * ใบลา / OT / คำขอแก้เวลา / คำขอทำงานนอกสถานที่ / คำขอเอกสาร ที่ยังไม่จบ
 * จะค้างอยู่ในกล่องงานของผู้อนุมัติตลอดไป เพราะเจ้าตัวกดยกเลิกเองไม่ได้แล้ว
 * และผู้อนุมัติก็ไม่รู้ว่าคนนี้ถูกลบไปแล้ว
 *
 * ไม่ลบประวัติทิ้ง — รายการที่อนุมัติไปแล้วผูกกับเงินที่จ่ายจริงและต้องตรวจย้อนหลังได้
 */
describe('ปิดคำขอที่ค้างเมื่อลบพนักงาน', () => {
  function buildTx() {
    const model = () => ({ updateMany: jest.fn().mockResolvedValue({ count: 1 }) });

    return {
      leaveRequest: model(),
      overtimeRequest: model(),
      timeAdjustRequest: model(),
      offsiteWorkRequest: model(),
      documentRequest: model(),
      employeeTransfer: model(),
      leaveApprovalStep: model(),
      overtimeApprovalStep: model(),
      timeAdjustApprovalStep: model(),
    };
  }

  async function run(tx: ReturnType<typeof buildTx>) {
    const service = Object.create(
      EmployeesService.prototype,
    ) as EmployeesService;

    await (
      service as unknown as {
        cancelInFlightRequests: (
          tx: unknown,
          employeeId: string,
          actorId: string,
        ) => Promise<void>;
      }
    ).cancelInFlightRequests(tx, 'emp-1', 'user-1');
  }

  it('ปิดคำขอที่ยังเดินอยู่ครบทั้ง 5 ประเภท', async () => {
    const tx = buildTx();
    await run(tx);

    for (const model of [
      tx.leaveRequest,
      tx.overtimeRequest,
      tx.timeAdjustRequest,
      tx.offsiteWorkRequest,
      tx.documentRequest,
    ]) {
      expect(model.updateMany).toHaveBeenCalledTimes(1);
      expect(model.updateMany.mock.calls[0][0].data.status).toBe('CANCELLED');
    }
  });

  it('แตะเฉพาะสถานะที่ยังเดินอยู่ ไม่แตะที่อนุมัติ/ปฏิเสธไปแล้ว', async () => {
    const tx = buildTx();
    await run(tx);

    const where = tx.leaveRequest.updateMany.mock.calls[0][0].where;

    expect(where.employeeId).toBe('emp-1');
    expect(where.deletedAt).toBeNull();
    expect(where.status.in).toEqual(['DRAFT', 'SUBMITTED']);
  });

  it('คำขอทำงานนอกสถานที่ต้องรวมสถานะกลางของสายอนุมัติด้วย', async () => {
    const tx = buildTx();
    await run(tx);

    const where = tx.offsiteWorkRequest.updateMany.mock.calls[0][0].where;

    // ผ่านหัวหน้าแล้วแต่ยังรอ HR ก็ยังเป็นงานค้างที่ต้องปิด
    expect(where.status.in).toContain('MANAGER_APPROVED');
  });

  it('ปิดขั้นอนุมัติที่ยังรออยู่ด้วย ไม่งั้นยังโผล่ในกล่องงาน', async () => {
    const tx = buildTx();
    await run(tx);

    for (const model of [
      tx.leaveApprovalStep,
      tx.overtimeApprovalStep,
      tx.timeAdjustApprovalStep,
    ]) {
      const call = model.updateMany.mock.calls[0][0];

      expect(call.where.status.in).toEqual(['PENDING', 'WAITING']);
      expect(call.data.status).toBe('CANCELLED');
      expect(call.data.actedById).toBe('user-1');
      expect(call.data.reason).toContain('พนักงานถูกลบ');
    }
  });

  /*
   * ใบโยกย้ายต่างจากคำขออื่นตรงที่ไม่มีใครต้องมากดอนุมัติ
   * ตัวจับเวลาจะหยิบไปทำเองทุกคืน แล้วล้มทุกครั้งเพราะเจ้าของถูกลบไปแล้ว
   */
  it('ปิดใบโยกย้ายที่ตั้งวันไว้ล่วงหน้าด้วย', async () => {
    const tx = buildTx();
    await run(tx);

    const call = tx.employeeTransfer.updateMany.mock.calls[0][0];

    expect(call.where).toMatchObject({
      employeeId: 'emp-1',
      status: 'SCHEDULED',
    });
    expect(call.data.status).toBe('CANCELLED');
    expect(call.data.cancelledById).toBe('user-1');
  });
});
