import { BadRequestException } from '@nestjs/common';
import { OvertimeRequestsService } from './overtime-requests.service';

/**
 * คำขอ OT วันเดียวกันต้องไม่ทับช่วงเวลากันเอง
 *
 * เคสที่เคยพังจริง: พนักงานยื่นใบ OT วันที่ 28 ก.ค. ช่วงเดิมสองใบ
 * ระบบรับทั้งคู่และหัวหน้าอนุมัติทั้งคู่ ตอนคำนวณเงินเดือน
 * payroll-handoff ดึงใบที่ APPROVED ทุกใบในงวดมาสร้างรายการ OT ใบละบรรทัด
 * จึงจ่ายค่า OT ช่วงเดียวกันสองรอบ โดยไม่มีอะไรเตือนทั้งฝั่งพนักงานและ HR
 *
 * ไม่บล็อกทั้งวัน เพราะทำ OT ช่วงเช้าและช่วงค่ำของวันเดียวกันเกิดขึ้นจริง
 */
describe('OvertimeRequestsService · กันคำขอ OT ทับช่วงเวลากัน', () => {
  const workDate = new Date('2026-07-28T00:00:00.000Z');

  /** 18:00–20:00 เวลาไทย */
  const startTime = new Date('2026-07-28T18:00:00.000+07:00');
  const endTime = new Date('2026-07-28T20:00:00.000+07:00');

  function buildGuard(conflict: unknown) {
    const findFirst = jest.fn().mockResolvedValue(conflict);
    const prisma = { overtimeRequest: { findFirst } };

    // เรียกตัวสร้างโดยข้าม dependency ตัวอื่น เพราะ guard ใช้แค่ prisma
    const service = new (OvertimeRequestsService as unknown as new (
      ...args: unknown[]
    ) => OvertimeRequestsService)(prisma);

    return {
      findFirst,
      guard: (
        service as unknown as {
          ensureNoOverlappingRequest: (params: {
            employeeId: string;
            workDate: Date;
            startTime: Date;
            endTime: Date;
            excludeId?: string;
          }) => Promise<void>;
        }
      ).ensureNoOverlappingRequest.bind(service),
    };
  }

  it('ไม่มีใบทับช่วงเวลา ให้ผ่านได้', async () => {
    const { guard } = buildGuard(null);

    await expect(
      guard({ employeeId: 'emp-1', workDate, startTime, endTime }),
    ).resolves.toBeUndefined();
  });

  it('มีใบทับช่วงเวลาอยู่แล้ว ต้องปฏิเสธพร้อมบอกเลขที่ใบเดิม', async () => {
    const { guard } = buildGuard({
      requestNo: 'OT-2026-0007',
      startTime,
      endTime,
    });

    await expect(
      guard({ employeeId: 'emp-1', workDate, startTime, endTime }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      guard({ employeeId: 'emp-1', workDate, startTime, endTime }),
    ).rejects.toThrow(/OT-2026-0007/);
  });

  it('ข้อความต้องบอกช่วงเวลาไทยของใบเดิม ไม่ใช่เวลา UTC', async () => {
    const { guard } = buildGuard({
      requestNo: 'OT-2026-0007',
      startTime,
      endTime,
    });

    await expect(
      guard({ employeeId: 'emp-1', workDate, startTime, endTime }),
    ).rejects.toThrow(/18:00-20:00/);
  });

  it('ต้องมองข้ามใบที่ถูกปฏิเสธหรือยกเลิกไปแล้ว', async () => {
    const { findFirst, guard } = buildGuard(null);

    await guard({ employeeId: 'emp-1', workDate, startTime, endTime });

    const where = findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ notIn: ['REJECTED', 'CANCELLED'] });
    expect(where.deletedAt).toBeNull();
  });

  it('เงื่อนไขทับซ้อนต้องเป็นเริ่มก่อนอีกใบจบ และจบหลังอีกใบเริ่ม', async () => {
    const { findFirst, guard } = buildGuard(null);

    await guard({ employeeId: 'emp-1', workDate, startTime, endTime });

    const where = findFirst.mock.calls[0][0].where;
    expect(where.startTime).toEqual({ lt: endTime });
    expect(where.endTime).toEqual({ gt: startTime });
  });

  it('ตอนแก้ใบเดิมต้องไม่นับตัวเองเป็นใบที่ทับ', async () => {
    const { findFirst, guard } = buildGuard(null);

    await guard({
      employeeId: 'emp-1',
      workDate,
      startTime,
      endTime,
      excludeId: 'ot-1',
    });

    expect(findFirst.mock.calls[0][0].where.id).toEqual({ not: 'ot-1' });
  });
});
