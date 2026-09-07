import {
  buildRequestPayload,
  emptyRequestForm,
  hasErrors,
  toLocalDateString,
  toLocalDateTimeString,
  toLocalTimeString,
  validateRequestForm,
  type RequestFormState,
} from '@/features/requests/request-form';

/**
 * กับดักใหญ่ที่สุดของไฟล์นี้คือโซนเวลา
 *
 * ผู้ใช้เลือก "16 สิงหาคม" ได้ Date เที่ยงคืนตามเวลาไทย ถ้าเผลอใช้
 * toISOString() จะได้ 2026-08-15T17:00:00Z แล้วกลายเป็นลาผิดวันทั้งใบ
 * โดยที่หน้าจอยังโชว์วันถูก — ไม่มีใครจับได้จนกว่าจะถึงวันลาจริง
 */

const at = (
  year: number,
  month: number,
  dayOfMonth: number,
  hour = 0,
  minute = 0,
) => new Date(year, month - 1, dayOfMonth, hour, minute, 0, 0);

const form = (overrides: Partial<RequestFormState> = {}): RequestFormState => ({
  ...emptyRequestForm,
  reason: 'ไปธุระ',
  ...overrides,
});

describe('การแปลงวันเวลาเป็นสตริง', () => {
  it('วันที่ต้องเป็นวันตามปฏิทินของเครื่อง ไม่ใช่วันตาม UTC', () => {
    /* เที่ยงคืนตรง คือจุดที่ toISOString() จะให้วันก่อนหน้าในเขตเวลา UTC+x */
    expect(toLocalDateString(at(2026, 8, 16, 0, 0))).toBe('2026-08-16');
    /* ก่อนเที่ยงคืนนิดเดียว คือจุดที่จะข้ามไปวันถัดไปในเขตเวลา UTC-x */
    expect(toLocalDateString(at(2026, 8, 16, 23, 59))).toBe('2026-08-16');
  });

  it('เติมศูนย์นำหน้าเดือนและวันเสมอ', () => {
    expect(toLocalDateString(at(2026, 1, 5))).toBe('2026-01-05');
  });

  it('เวลาใช้รูปแบบ 24 ชั่วโมงและเติมศูนย์', () => {
    expect(toLocalTimeString(at(2026, 8, 16, 9, 5))).toBe('09:05');
    expect(toLocalTimeString(at(2026, 8, 16, 20, 30))).toBe('20:30');
  });

  it('datetime ต้องไม่มี Z ต่อท้าย ไม่งั้น backend จะอ่านเป็นเวลา UTC', () => {
    const value = toLocalDateTimeString(at(2026, 8, 16, 8, 30));

    expect(value).toBe('2026-08-16T08:30:00');
    expect(value).not.toContain('Z');
  });
});

describe('validateRequestForm · ใบลา', () => {
  const leave = (overrides: Partial<RequestFormState> = {}) =>
    validateRequestForm(
      'LEAVE',
      form({
        endDate: at(2026, 8, 16),
        leaveTypeId: 'lt-1',
        startDate: at(2026, 8, 16),
        ...overrides,
      }),
    );

  it('กรอกครบต้องผ่าน', () => {
    expect(hasErrors(leave())).toBe(false);
  });

  it('ไม่เลือกประเภทการลาต้องไม่ผ่าน', () => {
    expect(leave({ leaveTypeId: null }).leaveTypeId).toBeTruthy();
  });

  it('วันสุดท้ายก่อนวันเริ่มต้องไม่ผ่าน', () => {
    const errors = leave({
      endDate: at(2026, 8, 14),
      startDate: at(2026, 8, 16),
    });

    expect(errors.endDate).toBeTruthy();
  });

  it('ลาวันเดียวกันต้องผ่าน', () => {
    expect(hasErrors(leave({ endDate: at(2026, 8, 16) }))).toBe(false);
  });

  it('ลาเป็นชั่วโมงต้องบังคับกรอกเวลา', () => {
    const errors = leave({ dayType: 'HOURLY' });

    expect(errors.startAt).toBeTruthy();
    expect(errors.endAt).toBeTruthy();
  });

  it('ลาเป็นชั่วโมงโดยเวลาสิ้นสุดก่อนเวลาเริ่ม ต้องไม่ผ่าน', () => {
    const errors = leave({
      dayType: 'HOURLY',
      endAt: at(2026, 8, 16, 9, 0),
      startAt: at(2026, 8, 16, 11, 0),
    });

    expect(errors.endAt).toBeTruthy();
  });

  it('เหตุผลสั้นเกินไปต้องไม่ผ่าน', () => {
    expect(leave({ reason: 'ก' }).reason).toBeTruthy();
    expect(leave({ reason: '   ' }).reason).toBeTruthy();
  });
});

describe('validateRequestForm · OT', () => {
  const overtime = (overrides: Partial<RequestFormState> = {}) =>
    validateRequestForm(
      'OVERTIME',
      form({
        endAt: at(2026, 8, 16, 20, 0),
        startAt: at(2026, 8, 16, 18, 0),
        workDate: at(2026, 8, 16),
        ...overrides,
      }),
    );

  it('กรอกครบต้องผ่าน', () => {
    expect(hasErrors(overtime())).toBe(false);
  });

  /*
   * OT ข้ามเที่ยงคืนเป็นเรื่องปกติมาก (เข้าสองทุ่ม เลิกตีสอง)
   * เคยมีบั๊กที่ยื่นไม่ได้เลยเพราะเช็คว่าเวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม
   */
  it('OT ข้ามเที่ยงคืนต้องยื่นได้', () => {
    const errors = overtime({
      endAt: at(2026, 8, 17, 2, 0),
      startAt: at(2026, 8, 16, 20, 0),
    });

    expect(hasErrors(errors)).toBe(false);
  });

  it('เวลาเริ่มเท่ากับเวลาสิ้นสุดต้องไม่ผ่าน', () => {
    const errors = overtime({
      endAt: at(2026, 8, 16, 18, 0),
      startAt: at(2026, 8, 16, 18, 0),
    });

    expect(errors.endAt).toBeTruthy();
  });

  it('ไม่เลือกวันที่ต้องไม่ผ่าน', () => {
    expect(overtime({ workDate: null }).workDate).toBeTruthy();
  });
});

describe('validateRequestForm · งานนอกสถานที่', () => {
  /* ต่างจาก OT: backend รับเฉพาะช่วงเวลาภายในวันเดียว */
  it('เวลาสิ้นสุดย้อนกลับก่อนเวลาเริ่มต้องไม่ผ่าน', () => {
    const errors = validateRequestForm(
      'OFFSITE',
      form({
        endAt: at(2026, 8, 16, 9, 0),
        startAt: at(2026, 8, 16, 17, 0),
        workDate: at(2026, 8, 16),
      }),
    );

    expect(errors.endAt).toBeTruthy();
  });
});

describe('validateRequestForm · แก้เวลา', () => {
  it('ต้องเลือกวันและเวลาที่ถูกต้อง', () => {
    expect(
      validateRequestForm('TIME_ADJUST', form({ startAt: null })).startAt,
    ).toBeTruthy();

    expect(
      hasErrors(
        validateRequestForm(
          'TIME_ADJUST',
          form({ startAt: at(2026, 8, 16, 8, 30) }),
        ),
      ),
    ).toBe(false);
  });
});

describe('buildRequestPayload', () => {
  it('ใบลาเต็มวันต้องไม่ส่งเวลามาด้วย', () => {
    const payload = buildRequestPayload(
      'LEAVE',
      form({
        endDate: at(2026, 8, 17),
        leaveTypeId: 'lt-1',
        startDate: at(2026, 8, 16),
      }),
    );

    expect(payload).toMatchObject({
      dayType: 'FULL_DAY',
      endDate: '2026-08-17',
      leaveTypeId: 'lt-1',
      startDate: '2026-08-16',
    });
    expect(payload.startTime).toBeUndefined();
    expect(payload.endTime).toBeUndefined();
  });

  it('ใบลารายชั่วโมงต้องส่งเวลาแบบ HH:mm', () => {
    const payload = buildRequestPayload(
      'LEAVE',
      form({
        dayType: 'HOURLY',
        endAt: at(2026, 8, 16, 16, 0),
        endDate: at(2026, 8, 16),
        leaveTypeId: 'lt-1',
        startAt: at(2026, 8, 16, 14, 30),
        startDate: at(2026, 8, 16),
      }),
    );

    expect(payload).toMatchObject({
      endTime: '16:00',
      startTime: '14:30',
    });
  });

  /*
   * ประเภทวันเป็นของหลังบ้าน
   * แอปเคยส่ง workType ตามที่ผู้ใช้เลือก ตอนนี้ระบบจับจากปฏิทินวันหยุดเอง
   * ถ้าแอปกลับมาส่งอีก ค่าบนจอกับใบจริงจะไม่ตรงกันโดยไม่มีใครรู้
   */
  it('OT ต้องส่งวันทำงานและช่วงเวลา แต่ไม่ส่งประเภทวัน', () => {
    const payload = buildRequestPayload(
      'OVERTIME',
      form({
        endAt: at(2026, 8, 17, 2, 0),
        startAt: at(2026, 8, 16, 20, 0),
        workDate: at(2026, 8, 16),
      }),
    );

    expect(payload.workType).toBeUndefined();
    expect(payload).toMatchObject({
      endTime: '02:00',
      startTime: '20:00',
      workDate: '2026-08-16',
    });
  });

  it('แก้เวลาต้องส่ง requestedLogTime เป็นเวลาท้องถิ่นเต็มรูปแบบ', () => {
    const payload = buildRequestPayload(
      'TIME_ADJUST',
      form({
        adjustType: 'MISSING_CHECK_OUT',
        startAt: at(2026, 8, 16, 17, 45),
        targetLogType: 'CHECK_OUT',
      }),
    );

    expect(payload).toMatchObject({
      adjustType: 'MISSING_CHECK_OUT',
      requestedLogTime: '2026-08-16T17:45:00',
      targetLogType: 'CHECK_OUT',
    });
  });

  it('งานนอกสถานที่ต้องไม่ส่ง workType ซึ่งเป็นของ OT', () => {
    const payload = buildRequestPayload(
      'OFFSITE',
      form({
        endAt: at(2026, 8, 16, 17, 0),
        startAt: at(2026, 8, 16, 9, 0),
        workDate: at(2026, 8, 16),
      }),
    );

    expect(payload.workType).toBeUndefined();
    expect(payload).toMatchObject({
      endTime: '17:00',
      startTime: '09:00',
      workDate: '2026-08-16',
    });
  });

  /* ผู้ใช้พิมพ์เว้นวรรคท้ายบ่อยมากบนมือถือ */
  it('ตัดช่องว่างหัวท้ายของเหตุผลก่อนส่ง', () => {
    const payload = buildRequestPayload(
      'OFFSITE',
      form({
        endAt: at(2026, 8, 16, 17, 0),
        reason: '  ไปพบลูกค้า  ',
        startAt: at(2026, 8, 16, 9, 0),
        workDate: at(2026, 8, 16),
      }),
    );

    expect(payload.reason).toBe('ไปพบลูกค้า');
  });
});
