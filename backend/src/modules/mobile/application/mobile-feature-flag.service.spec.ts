import { MobileFeatureFlagService } from './mobile-feature-flag.service';

/**
 * BE-MOB-006 — flag ต้องมาจากสิทธิ์และการตั้งค่าเดิมเท่านั้น
 *
 * ถ้าเปิด flag ทั้งที่สิทธิ์จริงไม่มี ผู้ใช้จะเห็นปุ่มแล้วกดไปเจอ 403
 * ซึ่งแย่กว่าไม่เห็นปุ่มเลย
 */
describe('MobileFeatureFlagService', () => {
  const service = new MobileFeatureFlagService();

  const employeeWithMobile = { allowedAttendanceMethods: ['WEB', 'MOBILE'] };

  it('พนักงานที่อนุญาตลงเวลาผ่านแอปและมีสิทธิ์ ต้องเปิด attendancePunch', () => {
    const flags = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ESS_ACCESS', 'ATTENDANCE_CHECKIN'],
    });

    expect(flags.attendancePunch).toBe(true);
    expect(flags.attendance).toBe(true);
  });

  it('มีสิทธิ์ลงเวลา แต่พนักงานไม่ได้รับอนุญาตให้ใช้แอป ต้องปิด attendancePunch', () => {
    const flags = service.resolve({
      employee: { allowedAttendanceMethods: ['WEB', 'DEVICE'] },
      permissions: ['ESS_ACCESS', 'ATTENDANCE_CHECKIN'],
    });

    expect(flags.attendancePunch).toBe(false);
  });

  /*
   * จอเวลาของตัวเองกับปุ่มลงเวลาเป็นคนละสิทธิ์กัน — /attendance/history บังคับแค่
   * ESS_ACCESS พนักงานที่ HR ให้ลงเวลาด้วยเครื่องสแกนจึงต้องยังเปิดแท็บดูเวลา
   * เข้าออกของตัวเองได้ ไม่งั้นเขาไม่มีทางตรวจเวลาตัวเองจากที่ไหนเลยในแอป
   */
  it('ไม่มีสิทธิ์กดลงเวลา ต้องยังเปิด attendance ให้ดูเวลาตัวเองได้', () => {
    const flags = service.resolve({
      employee: { allowedAttendanceMethods: ['DEVICE'] },
      permissions: ['ESS_ACCESS'],
    });

    expect(flags.attendance).toBe(true);
    expect(flags.attendancePunch).toBe(false);
  });

  it('ไม่มี ESS_ACCESS ต้องปิดทุกฟีเจอร์ที่ต้องใช้ ESS', () => {
    const flags = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ATTENDANCE_CHECKIN'],
    });

    expect(flags).toMatchObject({
      attendance: false,
      attendancePunch: false,
      leave: false,
      overtime: false,
      payslip: false,
      timeAdjust: false,
    });
  });

  /*
   * flag ของใบคำขอต้องตรงกับสิทธิ์ที่ route จริงบังคับ ไม่ใช่แค่ ESS_ACCESS
   * ไม่งั้นผู้ใช้กรอกฟอร์มจนจบแล้วเจอ 403 ตอนกดยื่น
   */
  it('ใบคำขอแต่ละประเภทต้องใช้สิทธิ์ CREATE ของตัวเอง ไม่ใช่แค่ ESS_ACCESS', () => {
    const essOnly = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ESS_ACCESS'],
    });

    expect(essOnly).toMatchObject({
      leave: false,
      offsite: false,
      overtime: false,
      timeAdjust: false,
    });

    const withCreate = service.resolve({
      employee: employeeWithMobile,
      permissions: [
        'ESS_ACCESS',
        'LEAVE_CREATE',
        'OT_CREATE',
        'TIME_ADJUST_CREATE',
        'OFFSITE_REQUEST_CREATE',
      ],
    });

    expect(withCreate).toMatchObject({
      leave: true,
      offsite: true,
      overtime: true,
      timeAdjust: true,
    });
  });

  /* สิทธิ์แยกกันจริง ๆ ให้ลาได้อย่างเดียวต้องไม่พลอยเปิด OT ให้ด้วย */
  it('มีสิทธิ์ลาอย่างเดียว ต้องเปิดเฉพาะ leave', () => {
    const flags = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ESS_ACCESS', 'LEAVE_CREATE'],
    });

    expect(flags).toMatchObject({
      leave: true,
      offsite: false,
      overtime: false,
      timeAdjust: false,
    });
  });


  it('schedule ต้องเปิดเมื่อมี ESS_ACCESS และปิดเมื่อไม่มี ESS_ACCESS', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS'],
      }).schedule,
    ).toBe(true);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: [],
      }).schedule,
    ).toBe(false);
  });

  it('complaints ต้องใช้ COMPLAINT_CREATE เพิ่มจาก ESS_ACCESS', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS'],
      }).complaints,
    ).toBe(false);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'COMPLAINT_CREATE'],
      }).complaints,
    ).toBe(true);
  });

  it('documents ต้องใช้ DOCUMENT_CREATE เพิ่มจาก ESS_ACCESS', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS'],
      }).documents,
    ).toBe(false);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'DOCUMENT_CREATE'],
      }).documents,
    ).toBe(true);
  });

  it('payslip ต้องใช้ PAYROLL_SLIP_VIEW เพิ่มจาก ESS_ACCESS', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS'],
      }).payslip,
    ).toBe(false);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'PAYROLL_SLIP_VIEW'],
      }).payslip,
    ).toBe(true);
  });

  it('executive ต้องใช้ EXECUTIVE_VIEW ให้ตรงกับ route จริง', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'EXECUTIVE_VIEW'],
      }).executive,
    ).toBe(true);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['EXECUTIVE_VIEW'],
      }).executive,
    ).toBe(false);
  });

  it('สิทธิ์รายงานและกำลังคนชุดเก่าต้องไม่เปิดห้องผู้บริหาร', () => {
    const flags = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ESS_ACCESS', 'REPORT_VIEW', 'MANPOWER_READ'],
    });

    expect(flags.executive).toBe(false);
  });

  it('ข้อมูลทีมต้องใช้ TEAM_VIEW ไม่ใช่ APPROVAL_ACCESS', () => {
    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'TEAM_VIEW'],
      }).team,
    ).toBe(true);

    expect(
      service.resolve({
        employee: employeeWithMobile,
        permissions: ['ESS_ACCESS', 'APPROVAL_ACCESS'],
      }).team,
    ).toBe(false);
  });

  it('offline punch ต้องปิดไว้เสมอจนกว่าจะผ่าน Phase 6', () => {
    const flags = service.resolve({
      employee: employeeWithMobile,
      permissions: ['ESS_ACCESS', 'ATTENDANCE_CHECKIN', 'PAYROLL_SLIP_VIEW'],
    });

    expect(flags.offlinePunch).toBe(false);
  });

  it('บัญชีที่ยังไม่ผูกพนักงาน ต้องไม่เปิดปุ่มลงเวลา', () => {
    const flags = service.resolve({
      employee: null,
      permissions: ['ESS_ACCESS', 'ATTENDANCE_CHECKIN'],
    });

    expect(flags.attendancePunch).toBe(false);
  });
});
