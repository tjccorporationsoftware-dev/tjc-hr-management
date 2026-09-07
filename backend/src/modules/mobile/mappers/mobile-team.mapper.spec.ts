import { toMobileTeamSummary } from './mobile-team.mapper';

/**
 * จอนี้หัวหน้าเปิดตอนเช้าเพื่อหาว่า "ใครยังไม่มา"
 * ถ้าเรียงผิด คนที่ต้องตามจะจมอยู่ท้ายรายชื่อของทีมยี่สิบคน
 */
describe('toMobileTeamSummary', () => {
  const member = (
    code: string,
    status: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    employee: { displayName: `พนักงาน ${code}`, employeeCode: code, id: code },
    month: { absentDays: 0, lateDays: 0, lateMinutes: 0, missingDays: 0, otHours: 0 },
    today: { lateMinutes: 0, status },
    ...overrides,
  });

  it('เรียงคนที่ต้องจัดการขึ้นก่อน ไม่ใช่เรียงตามตัวอักษร', () => {
    const result = toMobileTeamSummary({
      members: [
        member('005', 'PRESENT'),
        member('004', 'LEAVE'),
        member('003', 'LATE'),
        member('002', 'NOT_CHECKED_IN'),
        member('001', 'ABSENT'),
      ],
    });

    expect(result.members.map((item) => item.status)).toEqual([
      'ABSENT',
      'NOT_CHECKED_IN',
      'LATE',
      'LEAVE',
      'PRESENT',
    ]);
  });

  /* ในกลุ่มเดียวกัน คนสายมากควรอยู่บน — หัวหน้าจะได้คุยกับคนที่หนักสุดก่อน */
  it('คนสายเท่ากันสถานะ ให้คนสายมากอยู่บน', () => {
    const result = toMobileTeamSummary({
      members: [
        member('001', 'LATE', { today: { lateMinutes: 5, status: 'LATE' } }),
        member('002', 'LATE', { today: { lateMinutes: 45, status: 'LATE' } }),
      ],
    });

    expect(result.members.map((item) => item.employeeCode)).toEqual([
      '002',
      '001',
    ]);
  });

  it('สายเท่ากันให้เรียงตามรหัสพนักงาน เพื่อให้ตำแหน่งไม่สลับไปมาทุกครั้งที่รีเฟรช', () => {
    const result = toMobileTeamSummary({
      members: [member('009', 'PRESENT'), member('002', 'PRESENT')],
    });

    expect(result.members.map((item) => item.employeeCode)).toEqual([
      '002',
      '009',
    ]);
  });

  it('ไม่มีชื่อที่แสดงผล ต้องประกอบจากชื่อ-นามสกุล', () => {
    const result = toMobileTeamSummary({
      members: [
        {
          employee: { firstName: 'สมชาย', lastName: 'ใจดี' },
          today: { status: 'PRESENT' },
        },
      ],
    });

    expect(result.members[0]?.name).toBe('สมชาย ใจดี');
  });

  it('ไม่มีลูกทีมต้องคืนโครงเดิมพร้อมเลขศูนย์ ไม่ใช่ค่าว่าง', () => {
    const result = toMobileTeamSummary({});

    expect(result.members).toEqual([]);
    expect(result.todayCounts.teamTotal).toBe(0);
    expect(result.monthTotals.lateDays).toBe(0);
  });

  it('สถานะที่ยังไม่รู้จักต้องไม่ทำให้ทั้งจอพัง', () => {
    const result = toMobileTeamSummary({
      members: [member('001', 'SOMETHING_NEW')],
    });

    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.status).toBe('SOMETHING_NEW');
  });

  it('แปลงยอดสะสมรายเดือนของแต่ละคนให้เป็นตัวเลขเสมอ', () => {
    const result = toMobileTeamSummary({
      members: [
        member('001', 'PRESENT', {
          month: {
            absentDays: '2',
            lateDays: '3',
            lateMinutes: '75',
            missingDays: '1',
            otHours: '4.5',
          },
        }),
      ],
    });

    expect(result.members[0]).toMatchObject({
      monthAbsentDays: 2,
      monthLateDays: 3,
      monthLateMinutes: 75,
      monthMissingDays: 1,
      monthOtHours: 4.5,
    });
  });
});
