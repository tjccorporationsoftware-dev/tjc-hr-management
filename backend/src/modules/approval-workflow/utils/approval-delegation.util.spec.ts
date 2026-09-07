import {
  buildDelegationNote,
  delegatedUserIds,
  findDelegationForStep,
  loadActiveDelegations,
} from './approval-delegation.util';
import { canActOnApprovalStep } from './approval-step-authorization.util';

/**
 * มอบอำนาจอนุมัติแทน
 *
 * เดิมระบบไม่มีเรื่องนี้เลย ผู้อนุมัติลาพักร้อนหรือลาป่วยยาว
 * ใบลา/OT/คำขอแก้เวลาของทั้งทีมจะค้างจนกว่าเจ้าตัวจะกลับมา
 * ทางเดียวคือให้ SYSTEM_ADMIN กดข้ามให้ ซึ่งไม่มีร่องรอยว่ากดแทนใคร
 */
describe('loadActiveDelegations', () => {
  function buildDb(rows: any[] = []) {
    return {
      approvalDelegation: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
  }

  it('ค้นเฉพาะใบที่ยังมีผล ไม่ถูกยกเลิก และคร่อมวันที่อ้างอิง', async () => {
    const db = buildDb();
    await loadActiveDelegations(
      db,
      'user-delegate',
      'LEAVE_REQUEST',
      new Date('2026-08-11T01:30:00+07:00'),
    );

    const where = db.approvalDelegation.findMany.mock.calls[0][0].where;

    expect(where.delegateUserId).toBe('user-delegate');
    expect(where.status).toBe('ACTIVE');
    expect(where.revokedAt).toBeNull();
    expect(where.deletedAt).toBeNull();
    // ตัดวันตามเวลาไทย — ตีหนึ่งครึ่งของวันที่ 11 ต้องยังเป็นวันที่ 11
    expect(where.startDate).toEqual({ lte: new Date('2026-08-11T00:00:00.000Z') });
    expect(where.endDate).toEqual({ gte: new Date('2026-08-11T00:00:00.000Z') });
  });

  it('ใบที่ไม่จำกัดประเภท กับใบที่ระบุประเภทตรงกัน ต้องเข้าเงื่อนไขทั้งคู่', async () => {
    const db = buildDb();
    await loadActiveDelegations(db, 'user-1', 'OVERTIME_REQUEST');

    const where = db.approvalDelegation.findMany.mock.calls[0][0].where;

    expect(where.OR).toEqual([
      { targetTypes: { isEmpty: true } },
      { targetTypes: { has: 'OVERTIME_REQUEST' } },
    ]);
  });

  it('แปลงผลเป็นรายชื่อผู้มอบอำนาจพร้อมชื่อที่อ่านออก', async () => {
    const db = buildDb([
      {
        id: 'dlg-1',
        delegatorUserId: 'user-boss',
        delegator: { displayName: 'สมชาย ใจดี', email: 'boss@tjc.local' },
      },
    ]);

    const result = await loadActiveDelegations(db, 'user-1', 'LEAVE_REQUEST');

    expect(result).toEqual([
      { id: 'dlg-1', delegatorUserId: 'user-boss', delegatorName: 'สมชาย ใจดี' },
    ]);
  });

  it('ไม่มีชื่อ ใช้อีเมลแทน จะได้ไม่โชว์ค่าว่างในบันทึก', async () => {
    const db = buildDb([
      {
        id: 'dlg-1',
        delegatorUserId: 'user-boss',
        delegator: { displayName: null, email: 'boss@tjc.local' },
      },
    ]);

    const [row] = await loadActiveDelegations(db, 'user-1', 'LEAVE_REQUEST');

    expect(row.delegatorName).toBe('boss@tjc.local');
  });
});

describe('canActOnApprovalStep · ผู้รับมอบอำนาจ', () => {
  const step = {
    expectedApproverId: 'user-boss',
    approverType: 'SUPERVISOR',
    roleCode: null,
    nameTh: 'หัวหน้างาน',
  };

  it('ผู้รับมอบอำนาจกดแทนผู้อนุมัติตัวจริงได้', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-delegate',
        actorRoleCodes: [],
        delegatedFromUserIds: ['user-boss'],
      }),
    ).toBe(true);
  });

  it('รับมอบอำนาจจากคนอื่น ไม่ได้แปลว่ากดขั้นของคนที่ไม่ได้มอบได้', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-delegate',
        actorRoleCodes: [],
        delegatedFromUserIds: ['user-someone-else'],
      }),
    ).toBe(false);
  });

  it('รับมอบอำนาจแล้ว ก็ยังอนุมัติใบของตัวเองไม่ได้', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-delegate',
        actorRoleCodes: [],
        delegatedFromUserIds: ['user-boss'],
        owner: { requesterUserId: 'user-delegate' },
      }),
    ).toBe(false);
  });

  it('ไม่ส่งข้อมูลมอบอำนาจมา พฤติกรรมเดิมไม่เปลี่ยน', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-delegate',
        actorRoleCodes: [],
      }),
    ).toBe(false);
  });
});

describe('บันทึกว่าใครกดแทนใคร', () => {
  const delegations = [
    { id: 'dlg-1', delegatorUserId: 'user-boss', delegatorName: 'สมชาย ใจดี' },
  ];

  it('หาใบที่ทำให้กดขั้นนี้ได้', () => {
    expect(findDelegationForStep(delegations, 'user-boss')?.id).toBe('dlg-1');
  });

  it('ขั้นที่ไม่ได้ผูกผู้อนุมัติ ไม่ต้องอ้างใบมอบอำนาจ', () => {
    expect(findDelegationForStep(delegations, null)).toBeNull();
  });

  it('ข้อความบันทึกบอกทั้งชื่อผู้มอบและเลขที่ใบ', () => {
    const note = buildDelegationNote(delegations[0]);

    expect(note).toContain('สมชาย ใจดี');
    expect(note).toContain('dlg-1');
  });

  it('ไม่ได้กดแทนใคร ไม่ต้องมีข้อความต่อท้าย', () => {
    expect(buildDelegationNote(null)).toBeNull();
  });

  it('ดึงรายชื่อ userId ไปใช้ต่อได้', () => {
    expect(delegatedUserIds(delegations)).toEqual(['user-boss']);
  });
});
