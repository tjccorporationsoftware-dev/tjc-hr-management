import {
  teamAttendanceLogSchema,
  teamCalendarDaySchema,
  teamMemberDetailSchema,
  teamMemberListItemSchema,
  teamRequestItemSchema,
} from '@/features/team/team-views';
import { queryKeys } from '@/lib/query/query-keys';

/**
 * สัญญาข้อมูลของจอทีม
 *
 * จอพวกนี้อ่านอย่างเดียวก็จริง แต่พังง่ายเป็นพิเศษ เพราะ backend คืน null
 * ในหลายฟิลด์ตามสภาพข้อมูลจริง (พนักงานที่ยังไม่มีแผนก ยังไม่ผูกกะ ยังไม่มี
 * เบอร์โทร) ถ้า schema เข้มเกินไป ทั้งจอจะขึ้น error แทนที่จะแสดงขีดกลาง
 */
describe('สัญญาข้อมูลของจอทีม', () => {
  it('รายชื่อลูกทีมรับข้อมูลที่ยังกรอกไม่ครบได้', () => {
    const parsed = teamMemberListItemSchema.parse({
      branch: null,
      department: null,
      employeeCode: null,
      id: 'emp-1',
      name: null,
      position: null,
      status: null,
    });

    expect(parsed.id).toBe('emp-1');
  });

  it('รายละเอียดสมาชิกเติมค่าเริ่มต้นเมื่อ backend ไม่ส่งบางก้อนมา', () => {
    const parsed = teamMemberDetailSchema.parse({
      monthTotals: {},
      previousMonthTotals: {},
      profile: { id: 'emp-1' },
      today: {},
    });

    expect(parsed.leaveBalances).toEqual([]);
    expect(parsed.monthTotals.lateDays).toBe(0);
    expect(parsed.today.status).toBe('NOT_CHECKED_IN');
    expect(parsed.shift).toBeUndefined();
  });

  it('รายละเอียดสมาชิกแปลงวันที่เป็น Date ไม่ใช่ string', () => {
    const parsed = teamMemberDetailSchema.parse({
      monthTotals: {},
      previousMonthTotals: {},
      profile: { id: 'emp-1', startDate: '2024-01-15T00:00:00.000Z' },
      today: { morningInAt: '2026-08-21T01:05:00.000Z' },
    });

    expect(parsed.profile.startDate).toBeInstanceOf(Date);
    expect(parsed.today.morningInAt).toBeInstanceOf(Date);
  });

  it('วันในปฏิทินทีมที่ไม่มีใครลาต้องได้ลิสต์ว่าง ไม่ใช่ undefined', () => {
    const parsed = teamCalendarDaySchema.parse({
      date: '2026-08-03',
      weekday: 1,
    });

    expect(parsed.leaves).toEqual([]);
    expect(parsed.offsites).toEqual([]);
    expect(parsed.awayTotal).toBe(0);
    expect(parsed.isHoliday).toBe(false);
  });

  it('รายการลงเวลาของทีมรับ log ที่ไม่มีสถานที่และหมายเหตุได้', () => {
    const parsed = teamAttendanceLogSchema.parse({
      id: 'log-1',
      logTime: '2026-08-21T01:05:00.000Z',
      logType: 'CHECK_IN',
      status: 'NORMAL',
      workDate: '2026-08-21',
    });

    expect(parsed.logTime).toBeInstanceOf(Date);
    expect(parsed.isOffsite).toBe(false);
    expect(parsed.locationName).toBeUndefined();
  });

  it('คำขอของทีมต้องมีประเภทที่แอปรู้จักเท่านั้น', () => {
    expect(() =>
      teamRequestItemSchema.parse({
        id: 'req-1',
        status: 'SUBMITTED',
        title: 'ลาป่วย',
        type: 'SOMETHING_NEW',
      }),
    ).toThrow();
  });

  it('คำขอของทีมเก็บชื่อผู้ยื่นไว้แยกจากข้อมูลใบ', () => {
    const parsed = teamRequestItemSchema.parse({
      employeeCode: '000123',
      employeeId: 'emp-1',
      employeeName: 'สมชาย ใจดี',
      id: 'req-1',
      status: 'APPROVED',
      title: 'ลาพักร้อน',
      type: 'LEAVE',
    });

    expect(parsed.employeeName).toBe('สมชาย ใจดี');
    expect(parsed.type).toBe('LEAVE');
  });
});

/**
 * เดือนและตัวกรองต้องอยู่ใน query key
 *
 * ถ้าไม่อยู่ react-query จะถือว่าเป็นข้อมูลชุดเดียวกัน แล้วหัวหน้าที่สลับ
 * ไปดูเดือนก่อนจะเห็นตัวเลขของเดือนปัจจุบันค้างอยู่ ซึ่งเป็นบั๊กที่ไม่มีทาง
 * เห็นตอนทดสอบด้วยข้อมูลเดือนเดียว
 */
describe('query key ของจอทีม', () => {
  it('แยก cache ตามเดือนที่เลือก', () => {
    expect(queryKeys.teamSummary({ month: '2026-07' })).not.toEqual(
      queryKeys.teamSummary({ month: '2026-08' }),
    );
    expect(queryKeys.teamCalendar('2026-07')).not.toEqual(
      queryKeys.teamCalendar(),
    );
  });

  it('แยก cache ของสมาชิกแต่ละคน', () => {
    expect(queryKeys.teamMember('emp-1')).not.toEqual(
      queryKeys.teamMember('emp-2'),
    );
  });

  it('แยก cache ตามตัวกรองของประวัติเวลาและคำขอ', () => {
    expect(queryKeys.teamAttendance({ employeeId: 'emp-1' })).not.toEqual(
      queryKeys.teamAttendance({}),
    );
    expect(queryKeys.teamRequests({ status: 'APPROVED' })).not.toEqual(
      queryKeys.teamRequests({ status: 'SUBMITTED' }),
    );
  });
});
