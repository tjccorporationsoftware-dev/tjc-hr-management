import {
  APPROVAL_ADMIN_ROLE_CODES,
  canActOnApprovalStep,
} from './approval-step-authorization.util';

/**
 * กติกาว่าใครกดอนุมัติขั้นนี้ได้ ต้องตรงกับที่กล่องงาน /approvals/pending ใช้จับคู่
 * ไม่งั้นรายการจะโผล่ในกล่องงานของคนที่กดไม่ได้จริง
 */
describe('canActOnApprovalStep', () => {
  const act = (step: Record<string, unknown>, roles: string[], actorId = 'user-x') =>
    canActOnApprovalStep({ step, actorId, actorRoleCodes: roles });

  it('ผู้อนุมัติที่ระบบผูกไว้ กดได้', () => {
    expect(act({ expectedApproverId: 'user-x', approverType: 'SUPERVISOR' }, [])).toBe(true);
  });

  it('คนอื่นในขั้นที่เจาะจงตัวบุคคล กดไม่ได้', () => {
    expect(
      act({ expectedApproverId: 'user-boss', approverType: 'SUPERVISOR' }, ['MANAGER']),
    ).toBe(false);
    expect(
      act({ expectedApproverId: 'user-a', approverType: 'POSITION' }, ['MANAGER']),
    ).toBe(false);
    expect(
      act({ expectedApproverId: 'user-a', approverType: 'EMPLOYEE' }, ['MANAGER']),
    ).toBe(false);
  });

  describe('ขั้นที่ระบุเป็นกลุ่ม คนอื่นในกลุ่มกดแทนได้', () => {
    it('ขั้น HR_ADMIN', () => {
      expect(
        act({ expectedApproverId: 'user-hr1', approverType: 'HR_ADMIN' }, ['HR_ADMIN']),
      ).toBe(true);
      expect(
        act({ expectedApproverId: 'user-hr1', approverType: 'HR_ADMIN' }, ['EMPLOYEE']),
      ).toBe(false);
    });

    it('ขั้น EXECUTIVE', () => {
      expect(
        act({ expectedApproverId: 'user-md', approverType: 'EXECUTIVE' }, ['EXECUTIVE']),
      ).toBe(true);
      expect(
        act({ expectedApproverId: 'user-md', approverType: 'EXECUTIVE' }, ['MANAGER']),
      ).toBe(false);
    });

    it('ขั้น ROLE ตามรหัสบทบาทที่ระบุ', () => {
      const step = {
        expectedApproverId: 'user-acc1',
        approverType: 'ROLE',
        roleCode: 'PAYROLL_ACCOUNTING',
      };
      expect(act(step, ['PAYROLL_ACCOUNTING'])).toBe(true);
      expect(act(step, ['MANAGER'])).toBe(false);
    });

    it('ขั้นที่ตั้งชื่อว่า HR แม้ approverType เป็น ROLE', () => {
      expect(
        act({ expectedApproverId: 'user-hr1', approverType: 'ROLE', nameTh: 'ฝ่าย HR' }, [
          'HR_ADMIN',
        ]),
      ).toBe(true);
    });
  });

  describe('ทางลัดของแอดมินระบบ', () => {
    it('SYSTEM_ADMIN ปลดงานที่ผูกผู้อนุมัติผิดคนได้', () => {
      expect(
        act({ expectedApproverId: 'user-someone', approverType: 'SUPERVISOR' }, [
          'SYSTEM_ADMIN',
        ]),
      ).toBe(true);
    });

    it('รายชื่อบทบาทแอดมินต้องมี SYSTEM_ADMIN ที่ใช้จริงใน catalog', () => {
      expect(APPROVAL_ADMIN_ROLE_CODES).toContain('SYSTEM_ADMIN');
    });
  });

  it('ไม่สนตัวพิมพ์เล็กใหญ่ของรหัสบทบาท', () => {
    expect(
      act({ expectedApproverId: 'user-hr1', approverType: 'HR_ADMIN' }, ['hr_admin']),
    ).toBe(true);
  });
});

/**
 * กันอนุมัติงานของตัวเอง
 *
 * เคสที่เคยพังจริง: มีการกันเฉพาะโมดูลทำงานนอกสถานที่โมดูลเดียว
 * ใบลา / OT / คำขอแก้เวลา จึงอนุมัติของตัวเองได้ ถ้าถูกผูกเป็นผู้อนุมัติ
 * หรือถือบทบาท HR / ผู้บริหาร / แอดมิน ซึ่งเป็นเรื่องปกติมาก
 * เพราะหัวหน้างานและเจ้าหน้าที่ HR ก็เป็นลูกจ้างที่ยื่นใบลาและทำ OT เหมือนกัน
 */
describe('canActOnApprovalStep · กันอนุมัติงานตัวเอง', () => {
  const step = {
    expectedApproverId: 'user-1',
    approverType: 'SUPERVISOR',
    roleCode: null,
    nameTh: 'หัวหน้างาน',
  };

  it('คนยื่นเอง อนุมัติไม่ได้ แม้ถูกผูกเป็นผู้อนุมัติของขั้นนี้', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-1',
        actorRoleCodes: [],
        owner: { requesterUserId: 'user-1' },
      }),
    ).toBe(false);
  });

  it('เจ้าของเรื่อง (พนักงานที่คำขอมีผล) อนุมัติไม่ได้ แม้คนอื่นยื่นให้', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-1',
        actorRoleCodes: [],
        owner: { requesterUserId: 'user-9', subjectEmployeeId: 'emp-1' },
        actorEmployeeId: 'emp-1',
      }),
    ).toBe(false);
  });

  it('ผู้บริหารที่ไม่ใช่ HR อนุมัติของตัวเองไม่ได้ — ทางลัดต้องอยู่ใต้กติกานี้', () => {
    expect(
      canActOnApprovalStep({
        step: { ...step, approverType: 'EXECUTIVE', nameTh: 'ผู้บริหาร' },
        actorId: 'user-1',
        actorRoleCodes: ['EXECUTIVE'],
        owner: { requesterUserId: 'user-1' },
      }),
    ).toBe(false);
  });

  /*
   * ฝ่ายบุคคลเป็นข้อยกเว้นเดียว — บริษัทที่มี HR คนเดียว ใบของ HR คนนั้นจะค้าง
   * ที่ขั้น HR ตลอดไปถ้าไม่ปล่อย (ดู canApproveOwnRequest)
   */
  it('HR อนุมัติใบลาของตัวเองได้', () => {
    expect(
      canActOnApprovalStep({
        step: { ...step, approverType: 'HR_ADMIN', nameTh: 'ฝ่ายบุคคล' },
        actorId: 'user-1',
        actorRoleCodes: ['HR_ADMIN'],
        owner: { subjectEmployeeId: 'emp-1' },
        actorEmployeeId: 'emp-1',
      }),
    ).toBe(true);
  });

  it('แอดมินระบบนับเป็น HR ในสายอนุมัติอยู่แล้ว จึงอนุมัติของตัวเองได้เช่นกัน', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-1',
        actorRoleCodes: ['SYSTEM_ADMIN'],
        owner: { requesterUserId: 'user-1' },
      }),
    ).toBe(true);
  });

  it('รับมอบอำนาจมาก็ยังอนุมัติของตัวเองไม่ได้ ถ้าไม่ใช่ HR', () => {
    expect(
      canActOnApprovalStep({
        step: { ...step, expectedApproverId: 'manager-1' },
        actorId: 'user-1',
        actorRoleCodes: ['MANAGER'],
        owner: { requesterUserId: 'user-1' },
        delegatedFromUserIds: ['manager-1'],
      }),
    ).toBe(false);
  });

  it('คนอื่นอนุมัติได้ตามปกติ ไม่กระทบการใช้งานเดิม', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-1',
        actorRoleCodes: [],
        owner: { requesterUserId: 'user-9', subjectEmployeeId: 'emp-9' },
        actorEmployeeId: 'emp-2',
      }),
    ).toBe(true);
  });

  it('ไม่ส่งข้อมูลเจ้าของมา ยังทำงานเหมือนเดิม (ไม่บล็อกมั่ว)', () => {
    expect(
      canActOnApprovalStep({ step, actorId: 'user-1', actorRoleCodes: [] }),
    ).toBe(true);
  });

  it('ผู้กดยังไม่ผูกกับพนักงาน ไม่ถูกจับคู่เป็นเจ้าของโดยบังเอิญ', () => {
    expect(
      canActOnApprovalStep({
        step,
        actorId: 'user-1',
        actorRoleCodes: [],
        owner: { subjectEmployeeId: null },
        actorEmployeeId: null,
      }),
    ).toBe(true);
  });
});
