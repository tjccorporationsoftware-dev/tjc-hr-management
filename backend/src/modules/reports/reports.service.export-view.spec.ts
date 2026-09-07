import { ReportCode } from '../../generated/prisma/client';
import { ReportsService } from './reports.service';

/**
 * คอลัมน์ในไฟล์ที่โหลด ต้องตรงกับหน้าที่กดโหลด
 * -----------------------------------------------------------------------------
 * รายงานสถานะการมาทำงานคำนวณทีเดียวได้ทั้งยอดสรุปและปฏิทิน 31 ช่อง รวม 43 คอลัมน์
 * บนหน้าจอถูกแยกเป็นสองรายงานแล้ว แต่ตัวสร้างไฟล์ยังดัมป์ทุกคอลัมน์ลงไฟล์เดียว
 * ผลคือกดโหลดจากหน้าสรุปก็ได้ไฟล์ที่มีปฏิทินติดมาด้วย ซึ่งไม่ใช่สิ่งที่เห็นบนจอ
 */
describe('ReportsService · คอลัมน์ของไฟล์ตามมุมมอง', () => {
  const service = new ReportsService({} as never);

  /** applyReportView เป็น private แต่เป็นตรรกะบริสุทธิ์ที่ควรมีเทสคุม */
  const applyView = (
    reportCode: ReportCode,
    params: Record<string, unknown> | null,
    rows: Record<string, unknown>[],
  ) =>
    (
      service as unknown as {
        applyReportView: (
          code: ReportCode,
          params: Record<string, unknown> | null,
          rows: Record<string, unknown>[],
        ) => Record<string, unknown>[];
      }
    ).applyReportView(reportCode, params, rows);

  const row = () => ({
    employeeCode: '670028',
    employeeName: 'สุภาพร สองเมือง',
    departmentName: 'ธุรการ',
    d1: 'P',
    d2: 'L',
    d31: 'H',
    presentDays: 18,
    lateDays: 2,
    absentDays: 0,
  });

  it('มุมมองสรุป ต้องไม่มีช่องปฏิทินติดมา', () => {
    const [result] = applyView(
      ReportCode.WORK_STATUS,
      { view: 'summary' },
      [row()],
    );

    expect(Object.keys(result)).toEqual([
      'employeeCode',
      'employeeName',
      'departmentName',
      'presentDays',
      'lateDays',
      'absentDays',
    ]);
  });

  it('มุมมองปฏิทิน ต้องไม่มีคอลัมน์ยอดสรุปติดมา', () => {
    const [result] = applyView(
      ReportCode.WORK_STATUS,
      { view: 'calendar' },
      [row()],
    );

    expect(Object.keys(result)).toEqual([
      'employeeCode',
      'employeeName',
      'departmentName',
      'd1',
      'd2',
      'd31',
    ]);
  });

  /* ทั้งสองมุมมองต้องเก็บคอลัมน์ตัวตนพนักงานไว้ ไม่งั้นไฟล์บอกไม่ได้ว่าเป็นของใคร */
  it('ทั้งสองมุมมองยังมีรหัสและชื่อพนักงาน', () => {
    for (const view of ['summary', 'calendar']) {
      const [result] = applyView(ReportCode.WORK_STATUS, { view }, [row()]);

      expect(result.employeeCode).toBe('670028');
      expect(result.employeeName).toBe('สุภาพร สองเมือง');
    }
  });

  /*
   * ของเดิมที่เรียกโดยไม่ส่ง view มาต้องได้ทุกคอลัมน์เหมือนเดิม
   * ไม่งั้นงานที่ตั้งคิวไว้ก่อนหน้าจะได้ไฟล์ที่คอลัมน์หายไปเงียบ ๆ
   */
  it('ไม่ได้ส่งมุมมองมา ต้องได้ทุกคอลัมน์เหมือนเดิม', () => {
    const [result] = applyView(ReportCode.WORK_STATUS, null, [row()]);

    expect(Object.keys(result)).toHaveLength(Object.keys(row()).length);
  });

  it('มุมมองที่ไม่รู้จัก ต้องไม่ตัดคอลัมน์ทิ้ง', () => {
    const [result] = applyView(
      ReportCode.WORK_STATUS,
      { view: 'ไม่มีมุมมองนี้' },
      [row()],
    );

    expect(Object.keys(result)).toHaveLength(Object.keys(row()).length);
  });

  it('รายงานอื่นไม่ถูกกระทบ แม้ส่งมุมมองมา', () => {
    const [result] = applyView(
      ReportCode.ATTENDANCE,
      { view: 'summary' },
      [row()],
    );

    expect(Object.keys(result)).toHaveLength(Object.keys(row()).length);
  });
});
