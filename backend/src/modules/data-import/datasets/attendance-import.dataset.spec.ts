import { AttendanceImportDataset } from './attendance-import.dataset';
import type { DataImportMapping } from './data-import-dataset.types';

/**
 * อ่านไฟล์รายงานเวลาเข้า-ออกงานของระบบเดิม
 * -----------------------------------------------------------------------------
 * ไฟล์นี้เขียนทับข้อมูลลงเวลาที่ไหลต่อไปถึงเงินเดือน อ่านผิดหนึ่งช่องแปลว่า
 * มีคนโดนหักสายหรือถูกนับขาดงานทั้งที่มาทำงานจริง และไม่มีใครรู้จนกว่าจะถึงวันจ่าย
 *
 * เคสในไฟล์จริง (14 คน × 30 วัน) มีสี่แบบ: ไม่แตะเลย · แตะ 2 · แตะ 3 · แตะ 4 ครั้ง
 */

/** ตำแหน่งคอลัมน์ตามไฟล์จริง: 1 ชื่อ · 2 วันที่ · 3 สถานะ · 5-16 เวลาแตะบัตร */
const MAPPING: DataImportMapping = {
  employee: 1,
  workDate: 2,
  dayStatus: 3,
  punch1: 5,
  punch2: 6,
  punch3: 7,
  punch4: 8,
  punch5: 9,
  punch6: 10,
};

/** dataset ที่ดัก createMany ไว้ดูว่าเขียนอะไรลงฐานจริง */
function buildDatasetForCommit(created: any[]) {
  const tx = {
    attendanceLog: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: any) => {
        created.push(...data);
        return { count: data.length };
      },
    },
  };

  const prisma = {
    employee: {
      findMany: async () => [{ id: 'emp-1', employeeCode: '670028' }],
    },
    $transaction: async (fn: any) => fn(tx),
  };

  const queue = { enqueueDailySummaryRecalculation: async () => undefined };

  return new AttendanceImportDataset(prisma as never, queue as never);
}

function buildDataset() {
  const prisma = {
    employee: {
      findMany: async () => [{ id: 'emp-1', employeeCode: '670028' }],
    },
  };

  return new AttendanceImportDataset(prisma as never, {} as never);
}

function row(date: string, status: string, ...punches: string[]) {
  const cells = ['', date, status, '08:00 - 17:00'];
  for (let i = 0; i < 6; i += 1) cells.push(punches[i] ?? '');
  return cells;
}

async function prepare(dataRows: string[][]) {
  const dataset = buildDataset();

  return dataset.prepare({
    rows: [
      ['รายงานตารางเวลาการทำงาน'],
      ['ชื่อ-นามสกุล', 'วันที่', 'สถานะ', 'กะการทำงาน', 'IN', 'OUT'],
      ['670028 : สุภาพร สองเมือง (ตาล) แผนก: ธุรการ'],
      ...dataRows,
    ],
    headerRowIndex: 1,
    mapping: MAPPING,
    duplicateMode: 'UPDATE' as never,
    companyId: 'com-1',
  });
}

describe('AttendanceImportDataset · อ่านไฟล์รายงานเวลาเข้า-ออกงาน', () => {
  it('แตะ 4 ครั้ง ต้องเก็บรอยกลางไว้ครบ ไม่ทิ้งรอยออกไปพักเที่ยง', async () => {
    /*
     * ไฟล์จริงเดือน ก.ย. มี 31 วันที่แตะ 4-5 ครั้ง ของเดิมเก็บแค่ 3 รอย
     * รอยที่หายคือตอนออกไปพักเที่ยง ทำให้หน้าตรวจเวลาแสดงไม่ตรงกับไฟล์
     */
    const [result] = await prepare([
      row('28/06/2026', 'วันทำงาน', '08:18', '12:23', '13:00', '17:16'),
    ]);

    expect((result.payload as any).punches).toEqual([
      { session: 'MORNING', time: '08:18' },
      { session: 'CUSTOM', time: '12:23' },
      { session: 'AFTERNOON', time: '13:00' },
      { session: 'EVENING', time: '17:16' },
    ]);
  });

  it('รอยกลางที่อยู่นอกช่วงบ่าย ห้ามนับเป็นเข้างานบ่าย', async () => {
    /*
     * ออกพักเที่ยง 12:09 แล้วไม่ได้แตะกลับ ตอนเย็นแตะสองที (17:25, 17:37)
     * ของเดิมหยิบช่อง IN ตัวท้ายสุด = 17:25 เป็นเข้าบ่าย เลยกลายเป็นสายบ่าย
     * 245 นาที ทั้งที่ไฟล์ระบบเดิมบอกว่าวันนั้นไม่สายเลย
     */
    const [result] = await prepare([
      row('29/06/2026', 'วันทำงาน', '07:57', '12:09', '17:25', '17:37'),
    ]);

    expect((result.payload as any).punches).toEqual([
      { session: 'MORNING', time: '07:57' },
      { session: 'AFTERNOON', time: '12:09' },
      { session: 'CUSTOM', time: '17:25' },
      { session: 'EVENING', time: '17:37' },
    ]);
  });

  it('ไม่มีรอยกลางในช่วงบ่ายเลย = วันนั้นไม่ได้แตะเข้าบ่าย', async () => {
    // แตะ 08:00 แล้วมาแตะอีกทีตอน 17:00 สองครั้ง — ไม่ใช่การกลับจากพักเที่ยง
    const [result] = await prepare([
      row('30/06/2026', 'วันทำงาน', '08:00', '17:00', '17:00'),
    ]);

    expect((result.payload as any).punches).toEqual([
      { session: 'MORNING', time: '08:00' },
      { session: 'CUSTOM', time: '17:00' },
      { session: 'EVENING', time: '17:00' },
    ]);
  });

  it('เขียนเวลาแตะบัตรเป็นเวลาไทย ไม่ใช่ UTC ดิบ', async () => {
    /*
     * เวลาในไฟล์เป็นเวลาไทยตามหน้าปัด ถ้าเขียนลงเป็น UTC ตรง ๆ ทุกคนจะถูกบันทึก
     * ช้าไป 7 ชั่วโมง แล้วตัวคำนวณตีเป็นสาย 400 กว่านาทีทั้งบริษัทโดยไม่มี error
     */
    const created: any[] = [];
    const dataset = buildDatasetForCommit(created);

    const [result] = await prepare([
      row('26/06/2026', 'วันทำงาน', '07:50', '17:04'),
    ]);

    await dataset.commitRow({ row: result, actorId: 'user-1' } as never);

    // 07:50 ตามเวลาไทย = 00:50Z ของวันเดียวกัน
    expect(created[0].logTime.toISOString()).toBe('2026-06-26T00:50:00.000Z');
    expect(created[1].logTime.toISOString()).toBe('2026-06-26T10:04:00.000Z');
  });

  it('กะข้ามเที่ยงคืน เวลาออกงานต้องไปอยู่วันถัดไป', async () => {
    const created: any[] = [];
    const dataset = buildDatasetForCommit(created);

    // ออกงานตีสาม อยู่ในแถวของวันก่อนหน้าตามรูปแบบของไฟล์
    const [result] = await prepare([
      row('26/06/2026', 'วันทำงาน', '07:53', '03:00'),
    ]);

    await dataset.commitRow({ row: result, actorId: 'user-1' } as never);

    expect(created[0].logTime.toISOString()).toBe('2026-06-26T00:53:00.000Z');
    expect(created[1].logTime.toISOString()).toBe('2026-06-26T20:00:00.000Z');
    expect(created[1].logTime.getTime()).toBeGreaterThan(created[0].logTime.getTime());
  });

  it('แถวคั่นชื่อคนเป็นเซลล์ผสานทั้งแถว ต้องยังรู้ว่าเป็นของใคร', async () => {
    /*
     * ไฟล์จริงจากระบบเดิมผสานเซลล์แถวคั่นไว้ทั้งแถว ตัวอ่าน Excel จึงกระจาย
     * ข้อความเดิมลงทุกคอลัมน์ รวมถึงช่องวันที่ ถ้าตัดสินแถวคั่นด้วย
     * "ช่องวันที่ต้องว่าง" จะไม่มีแถวไหนผ่านเลย แล้วทั้งไฟล์กลายเป็น error
     */
    const dataset = buildDataset();
    const label = '670028 : สุภาพร สองเมือง (ตาล) แผนก: ธุรการ';

    const results = await dataset.prepare({
      rows: [
        ['รายงานตารางเวลาการทำงาน'],
        ['ชื่อ-นามสกุล', 'วันที่', 'สถานะ', 'กะการทำงาน', 'IN', 'OUT'],
        Array.from({ length: 10 }, () => label),
        row('26/06/2026', 'วันทำงาน', '08:12', '17:42'),
      ],
      headerRowIndex: 1,
      mapping: MAPPING,
      duplicateMode: 'UPDATE' as never,
      companyId: 'com-1',
    });

    expect(results).toHaveLength(1);
    expect(results[0].errors).toEqual([]);
    expect(results[0].action).toBe('CREATE');
    expect((results[0].payload as any).employeeCode).toBe('670028');
  });

  it('เขียน session ด้วยชื่อชุดของรอยสแกน ไม่ใช่ชื่อชุดของกติกา', async () => {
    /*
     * ตัวคำนวณหาการเข้างานด้วย session === 'MORNING' ตรงตัว ถ้าเขียนเป็น
     * 'MORNING_IN' (ซึ่งเป็นชื่อของ AttendanceSessionRule) มันจะหาไม่เจอ
     * แล้วตีเป็นลืมสแกนทั้งเดือนโดยไม่มี error ให้เห็น
     */
    const [result] = await prepare([
      row('26/06/2026', 'วันทำงาน', '08:12', '12:03', '17:42'),
    ]);

    expect((result.payload as any).punches).toEqual([
      { session: 'MORNING', time: '08:12' },
      { session: 'AFTERNOON', time: '12:03' },
      { session: 'EVENING', time: '17:42' },
    ]);
  });

  it('แตะ 3 ครั้ง = เข้าเช้า / เข้าบ่าย / ออกงาน', async () => {
    const [result] = await prepare([
      row('26/06/2026', 'วันทำงาน', '08:12', '12:03', '17:42'),
    ]);

    expect(result.action).toBe('CREATE');
    expect(result.values).toMatchObject({
      เข้างานเช้า: '08:12',
      เข้างานบ่าย: '12:03',
      ออกงาน: '17:42',
    });
  });

  it('แตะ 2 ครั้ง = เข้าเช้ากับออกงาน ไม่เดาว่ามีเข้าบ่าย', async () => {
    const [result] = await prepare([
      row('27/06/2026', 'วันทำงาน', '07:15', '17:42'),
    ]);

    expect(result.values).toMatchObject({
      เข้างานเช้า: '07:15',
      เข้างานบ่าย: '-',
      ออกงาน: '17:42',
    });
  });

  it('แตะ 4 ครั้ง = ครั้งท้ายสุดของกลางคือเข้าบ่าย (ตอนกลับจากพักเที่ยง)', async () => {
    const [result] = await prepare([
      row('28/06/2026', 'วันทำงาน', '08:15', '11:59', '12:48', '17:13'),
    ]);

    expect(result.values).toMatchObject({
      เข้างานเช้า: '08:15',
      เข้างานบ่าย: '12:48',
      ออกงาน: '17:13',
    });
    // เตือนไว้ให้คนตรวจเห็น เพราะเป็นแบบที่ตีความได้หลายทาง
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('วันที่ไม่มีการแตะบัตรเลย ต้องข้าม ไม่ใช่เขียนเป็นขาดงาน', async () => {
    const results = await prepare([
      row('29/06/2026', 'วันหยุดพนักงาน'),
      row('30/06/2026', 'วันทำงาน'),
    ]);

    expect(results.map((item) => item.action)).toEqual(['SKIP', 'SKIP']);
    expect(results.every((item) => item.payload === null)).toBe(true);
  });

  it('แถวคั่นชื่อคนไม่ใช่ข้อมูล และคนที่ไม่มีในระบบต้องขึ้นเป็นข้อผิดพลาด', async () => {
    const dataset = buildDataset();

    const results = await dataset.prepare({
      rows: [
        ['รายงาน'],
        ['ชื่อ-นามสกุล', 'วันที่', 'สถานะ', 'กะการทำงาน', 'IN', 'OUT'],
        ['670028 : สุภาพร สองเมือง'],
        row('26/06/2026', 'วันทำงาน', '08:12', '12:03', '17:42'),
        ['999999 : คนที่ไม่มีในระบบ'],
        row('26/06/2026', 'วันทำงาน', '08:00', '12:00', '17:00'),
      ],
      headerRowIndex: 1,
      mapping: MAPPING,
      duplicateMode: 'UPDATE' as never,
      companyId: 'com-1',
    });

    // แถวคั่นสองแถวต้องไม่ถูกนับเป็นข้อมูล เหลือแค่สองแถววันที่
    expect(results).toHaveLength(2);
    expect(results[0].action).toBe('CREATE');
    expect(results[1].action).toBe('ERROR');
    expect(results[1].errors[0]).toContain('999999');
  });

  it('เวลาที่อ่านไม่ออกต้องถูกทิ้ง ไม่ใช่กลายเป็นเวลามั่ว', async () => {
    const [result] = await prepare([
      row('26/06/2026', 'วันทำงาน', '08:12', 'ลาป่วยไม่ได้รับค่าจ้าง', '99:99', '17:42'),
    ]);

    expect(result.values).toMatchObject({
      เข้างานเช้า: '08:12',
      ออกงาน: '17:42',
    });
  });
});
