import { existsSync } from 'fs';
import { join } from 'path';

import { EmployeeImportDataset } from './datasets/employee-import.dataset';
import {
  buildAutoMapping,
  detectHeaderRowIndex,
  normalizeMapping,
} from './utils/data-import-mapping.util';
import {
  parseImportDate,
  parseImportNumber,
  splitCodeAndName,
  splitFullName,
  stripTrailingNickname,
} from './utils/data-import-value.util';
import { readSheetGrid } from './utils/excel-sheet.util';

/*
 * ไฟล์ตัวอย่างจริงจากระบบเดิม — หัวเรื่องคร่อมแถว 1 หัวตารางอยู่แถว 2
 * ถ้าไฟล์ไม่อยู่ในเครื่อง (เช่นบน CI ที่ไม่ได้ดึง docs มา) ให้ข้ามเฉพาะเทสต์ที่ใช้ไฟล์
 */
const SAMPLE_FILE = join(
  process.cwd(),
  '..',
  'docs',
  'ข้อมูลพนักงาน.xlsx',
);

const HEADER_ROW = [
  'ลำดับ',
  'สถานะ',
  'ระดับตำแหน่ง',
  'รหัสพนักงาน',
  'รหัสลายนิ้วมือ',
  'บริษัท',
  'สำนักงานสาขา',
  'แผนก',
  'ฝ่ายงาน',
  'หน่วยงาน',
  'ตำแหน่ง',
  'ประเภทพนักงาน',
  'กลุ่มพนักงาน',
  'ชื่อเล่น',
  'สัญชาติ',
  'คำนำหน้าชื่อ',
  'ชื่อ-นามสกุล',
  'ชื่อเล่น(EN)',
  'คำนำหน้าชื่อ(EN)',
  'ชื่อ-นามสกุล(EN)',
  'วันเกิด',
  'อายุ',
  'เพศ',
  'วันที่บรรจุ',
  'อายุงานวันที่บรรจุ',
  'วันที่เริ่มงาน',
  'อายุงานวันที่เริ่มงาน',
  'วันที่หมดสัญญาจ้าง',
  'วันที่ลาออก',
  'ที่อยู่ตามบัตร',
  'ที่อยู่ปัจจุบัน',
  'เงินเดือน',
];

function buildGrid(dataRows: string[][]) {
  return [
    ['รายงานทะเบียนพนักงาน (ข้อมูลพื้นฐาน)'],
    HEADER_ROW,
    ...dataRows,
  ];
}

function buildDataRow(overrides: Record<number, string> = {}) {
  const row = new Array(HEADER_ROW.length).fill('');

  row[1] = 'Active';
  row[3] = '670077';
  row[6] = 'บริษัท เอ.อาร์.ที.เอกซ์โพเนนเชียล จำกัด';
  row[7] = 'บริหาร';
  row[10] = 'ผู้จัดการบริษัท';
  row[11] = 'พนักงานรายเดือน';
  row[13] = 'แทมมี่';
  row[14] = 'ไทย';
  row[15] = 'นาย';
  row[16] = 'ปัญญดา ผาเหลา';
  row[19] = 'Panyada Phalao';
  row[20] = '14/09/1999';
  row[22] = 'ชาย';
  row[23] = '01/08/2020';
  row[25] = '01/08/2020';
  row[31] = '21000';

  for (const [index, value] of Object.entries(overrides)) {
    row[Number(index)] = value;
  }

  return row;
}

function createPrismaStub(
  overrides: Partial<Record<string, unknown[]>> = {},
) {
  const findMany = (key: string) => async () => (overrides[key] ?? []) as never;

  return {
    employee: { findMany: findMany('employee') },
    branch: { findMany: findMany('branch') },
    department: { findMany: findMany('department') },
    division: { findMany: findMany('division') },
    position: { findMany: findMany('position') },
    employeeType: { findMany: findMany('employeeType') },
  };
}

function createDataset(overrides?: Partial<Record<string, unknown[]>>) {
  return new EmployeeImportDataset(
    createPrismaStub(overrides) as never,
  );
}

type CommitCapture = {
  create?: { data: Record<string, unknown> };
  update?: { data: Record<string, unknown> };
  compensation?: { data: Record<string, unknown> };
};

/** จับค่าที่ commitRow ส่งให้ Prisma โดยไม่ต้องมีฐานข้อมูลจริง */
function createCommitDataset(
  overrides: Partial<Record<string, unknown[]>> = {},
) {
  const capture: CommitCapture = {};

  const savedEmployee = {
    id: 'employee-1',
    companyId: 'company-1',
    branchId: null,
    departmentId: null,
    divisionId: null,
    employeeTypeId: null,
    position: null,
    status: 'ACTIVE',
    startDate: new Date('2020-08-01T00:00:00.000Z'),
  };

  const tx = {
    employee: {
      create: async (args: { data: Record<string, unknown> }) => {
        capture.create = args;
        return savedEmployee;
      },
      update: async (args: { data: Record<string, unknown> }) => {
        capture.update = args;
        return savedEmployee;
      },
    },
    employeeWorkHistory: { create: async () => ({}) },
    employeeCompensation: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        capture.compensation = args;
        return {};
      },
    },
  };

  const prismaStub = {
    ...createPrismaStub(overrides),
    $transaction: async (handler: (client: typeof tx) => Promise<unknown>) =>
      handler(tx),
  };

  return {
    capture,
    dataset: new EmployeeImportDataset(prismaStub as never),
  };
}

describe('ตัวแปลงค่าไฟล์นำเข้า', () => {
  it('อ่านวันที่ทั้งแบบ วว/ดด/ปปปป และแบบเซลล์วันที่ของ Excel', () => {
    expect(parseImportDate('01/08/2020')?.toISOString()).toBe(
      '2020-08-01T00:00:00.000Z',
    );
    expect(parseImportDate('2020-08-01')?.toISOString()).toBe(
      '2020-08-01T00:00:00.000Z',
    );
  });

  it('แปลง พ.ศ. เป็น ค.ศ. ให้อัตโนมัติ', () => {
    expect(parseImportDate('01/08/2563')?.getUTCFullYear()).toBe(2020);
  });

  it('คืนค่าว่างเมื่ออ่านวันที่ไม่ออก แทนที่จะเดาเป็นวันนี้', () => {
    expect(parseImportDate('ไม่ระบุ')).toBeNull();
    expect(parseImportDate('32/13/2020')).toBeNull();
  });

  it('อ่านตัวเลขที่มีคอมมาคั่น', () => {
    expect(parseImportNumber('21,000.50')).toBe(21000.5);
    expect(parseImportNumber('')).toBeNull();
  });

  it('ตัดนามสกุลจากคำสุดท้าย และรองรับชื่อสองท่อน', () => {
    expect(splitFullName('ปัญญดา ผาเหลา')).toEqual({
      firstName: 'ปัญญดา',
      lastName: 'ผาเหลา',
    });
    expect(splitFullName('ศิริ ณัฐ วงศ์คำ')).toEqual({
      firstName: 'ศิริ ณัฐ',
      lastName: 'วงศ์คำ',
    });
  });

  it('แยกรหัสกับชื่อของ master data ที่มาติดกัน', () => {
    expect(splitCodeAndName('ET0001 : พนักงานรายเดือน')).toEqual({
      code: 'ET0001',
      name: 'พนักงานรายเดือน',
    });
  });

  it('ตัดชื่อเล่นในวงเล็บท้ายชื่อออก', () => {
    expect(stripTrailingNickname('ปัญญดา ผาเหลา(แทมมี่)')).toEqual({
      name: 'ปัญญดา ผาเหลา',
      nickname: 'แทมมี่',
    });
  });
});

describe('การหาหัวตารางและจับคู่คอลัมน์', () => {
  const dataset = createDataset();

  it('ข้ามแถวหัวเรื่องไปหาแถวหัวตารางจริง', () => {
    const grid = buildGrid([buildDataRow()]);

    expect(detectHeaderRowIndex(grid, dataset.fields)).toBe(1);
  });

  it('จับคู่คอลัมน์หลักได้ตรงตามไฟล์ของระบบเดิม', () => {
    const mapping = buildAutoMapping(HEADER_ROW, dataset.fields);

    expect(mapping.employeeCode).toBe(4);
    expect(mapping.fullName).toBe(17);
    expect(mapping.startDate).toBe(26);
    expect(mapping.probationPassedAt).toBe(24);
    expect(mapping.baseSalary).toBe(32);
  });

  it('ไม่ให้ "ชื่อเล่น" ไปคว้าคอลัมน์ "ชื่อเล่น(EN)"', () => {
    const mapping = buildAutoMapping(HEADER_ROW, dataset.fields);

    expect(mapping.nickname).toBe(14);
    expect(mapping.fullNameEn).toBe(20);
  });

  it('ทิ้งการจับคู่ที่ชี้ไปคอลัมน์ซึ่งไม่มีอยู่จริง', () => {
    const mapping = normalizeMapping(
      { employeeCode: 4, fullName: 999, startDate: 0 },
      dataset.fields,
      HEADER_ROW.length,
    );

    expect(mapping.employeeCode).toBe(4);
    expect(mapping.fullName).toBeNull();
    expect(mapping.startDate).toBeNull();
  });
});

describe('ทะเบียนพนักงาน — ตรวจแถวก่อนนำเข้า', () => {
  const dataset = createDataset();
  const mapping = buildAutoMapping(HEADER_ROW, dataset.fields);

  async function prepare(
    rows: string[][],
    options?: {
      duplicateMode?: 'UPDATE' | 'SKIP' | 'ERROR';
      instance?: EmployeeImportDataset;
    },
  ) {
    return (options?.instance ?? dataset).prepare({
      rows: buildGrid(rows),
      headerRowIndex: 1,
      mapping,
      duplicateMode: (options?.duplicateMode ?? 'UPDATE') as never,
      companyId: 'company-1',
    });
  }

  it('อ่านแถวปกติเป็นการสร้างพนักงานใหม่', async () => {
    const [row] = await prepare([buildDataRow()]);

    expect(row.action).toBe('CREATE');
    expect(row.key).toBe('670077');
    expect(row.errors).toEqual([]);
    expect(row.rowNo).toBe(3);
  });

  it('ข้ามแถวหัวกลุ่มและแถวว่างที่ไม่มีรหัสพนักงาน', async () => {
    const groupRow = new Array(HEADER_ROW.length).fill('');
    groupRow[0] = 'แผนก : บริหาร';

    const rows = await prepare([groupRow, buildDataRow(), []]);

    expect(rows).toHaveLength(1);
  });

  it('ตีเป็นแถวผิดพลาดเมื่อไม่มีวันที่เริ่มงาน', async () => {
    const [row] = await prepare([buildDataRow({ 25: '' })]);

    expect(row.action).toBe('ERROR');
    expect(row.errors).toContain('ไม่มีวันที่เริ่มงาน');
  });

  it('เตือนแต่ไม่ล้มแถว เมื่อไม่พบสังกัดในระบบ', async () => {
    const [row] = await prepare([buildDataRow()]);

    expect(row.action).toBe('CREATE');
    expect(row.warnings.join(' ')).toContain('ไม่พบแผนก');
  });

  it('จับรหัสพนักงานซ้ำกันเองภายในไฟล์เดียว', async () => {
    const rows = await prepare([buildDataRow(), buildDataRow()]);

    expect(rows[0].action).toBe('CREATE');
    expect(rows[1].action).toBe('ERROR');
    expect(rows[1].errors).toContain(
      'รหัสพนักงานนี้ซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน',
    );
  });

  it('ทำตามวิธีจัดการข้อมูลซ้ำที่ผู้ใช้เลือก', async () => {
    const withExisting = createDataset({
      employee: [{ id: 'employee-1', employeeCode: '670077' }],
    });

    const [updateRow] = await prepare([buildDataRow()], {
      instance: withExisting,
    });
    const [skipRow] = await prepare([buildDataRow()], {
      duplicateMode: 'SKIP',
      instance: withExisting,
    });
    const [errorRow] = await prepare([buildDataRow()], {
      duplicateMode: 'ERROR',
      instance: withExisting,
    });

    expect(updateRow.action).toBe('UPDATE');
    expect(skipRow.action).toBe('SKIP');
    expect(errorRow.action).toBe('ERROR');
    expect(errorRow.errors).toContain('มีพนักงานรหัสนี้อยู่แล้วในระบบ');
  });

  it('ผูกสังกัดให้เมื่อชื่อในไฟล์ตรงกับ master data', async () => {
    const withMasters = createDataset({
      department: [{ id: 'dept-1', code: 'D001', nameTh: 'บริหาร' }],
      employeeType: [
        { id: 'type-1', code: 'ET0001', nameTh: 'พนักงานรายเดือน' },
      ],
      position: [{ id: 'pos-1', code: 'P001', nameTh: 'ผู้จัดการบริษัท' }],
    });

    const [row] = await prepare([buildDataRow()], { instance: withMasters });
    const payload = row.payload as {
      departmentId: string | null;
      employeeTypeId: string | null;
      positionId: string | null;
    };

    expect(payload.departmentId).toBe('dept-1');
    expect(payload.employeeTypeId).toBe('type-1');
    expect(payload.positionId).toBe('pos-1');
  });

  it('เดาฐานค่าจ้างจากประเภทพนักงาน', async () => {
    const [monthly] = await prepare([buildDataRow()]);
    const [daily] = await prepare([buildDataRow({ 11: 'พนักงานรายวัน' })]);

    expect((monthly.payload as { salaryBasis: string }).salaryBasis).toBe(
      'MONTHLY',
    );
    expect((daily.payload as { salaryBasis: string }).salaryBasis).toBe(
      'DAILY',
    );
  });

  it('ตั้งสถานะเป็นลาออกให้คนที่มีวันที่ลาออกในไฟล์', async () => {
    const [row] = await prepare([
      buildDataRow({ 1: 'Out', 28: '01/05/2025' }),
    ]);
    const payload = row.payload as {
      status: string;
      employmentEndDate: string | null;
    };

    expect(payload.status).toBe('RESIGNED');
    expect(payload.employmentEndDate).toBe('2025-05-01');
  });
});

describe('ทะเบียนพนักงาน — ตอนเขียนข้อมูลจริง', () => {
  const mapping = buildAutoMapping(HEADER_ROW, createDataset().fields);

  async function prepareOne(
    dataset: EmployeeImportDataset,
    row: string[],
    duplicateMode: 'UPDATE' | 'SKIP' | 'ERROR' = 'UPDATE',
  ) {
    const [prepared] = await dataset.prepare({
      rows: buildGrid([row]),
      headerRowIndex: 1,
      mapping,
      duplicateMode: duplicateMode as never,
      companyId: 'company-1',
    });

    return prepared;
  }

  it('สร้างพนักงานใหม่ด้วยรหัสเดิมจากไฟล์ ไม่ออกรหัสใหม่ให้', async () => {
    const { capture, dataset } = createCommitDataset();
    const row = await prepareOne(dataset, buildDataRow());

    await dataset.commitRow({
      row,
      companyId: 'company-1',
      actorId: 'user-1',
    });

    expect(capture.create?.data.employeeCode).toBe('670077');
    expect(capture.create?.data.companyId).toBe('company-1');
    expect(capture.create?.data.startDate).toEqual(
      new Date('2020-08-01T00:00:00.000Z'),
    );
  });

  it('ช่องที่ไฟล์ไม่มีค่า ต้องไม่ถูกเขียนทับตอนอัปเดต', async () => {
    const { capture, dataset } = createCommitDataset({
      employee: [
        { id: 'employee-1', employeeCode: '670077', deletedAt: null },
      ],
    });

    /* ไฟล์ทะเบียนของระบบเดิมไม่มีคอลัมน์อีเมล เบอร์โทร และเลขบัตร */
    const row = await prepareOne(dataset, buildDataRow({ 22: '' }));

    expect(row.action).toBe('UPDATE');

    await dataset.commitRow({
      row,
      companyId: 'company-1',
      actorId: 'user-1',
    });

    const data = capture.update?.data ?? {};
    const profileUpdate = (
      data.profile as { upsert?: { update?: Record<string, unknown> } }
    )?.upsert?.update;

    expect(Object.keys(data)).not.toContain('email');
    expect(Object.keys(data)).not.toContain('phone');
    expect(Object.keys(data)).not.toContain('employmentEndDate');
    expect(Object.keys(profileUpdate ?? {})).not.toContain('gender');
    expect(Object.keys(profileUpdate ?? {})).not.toContain('nationalId');
    expect(profileUpdate?.registeredAddress).toBeUndefined();
    expect(data.firstName).toBe('ปัญญดา');
  });

  it('สร้างโครงสร้างค่าจ้างตั้งต้นให้คนที่ยังไม่มี', async () => {
    const { capture, dataset } = createCommitDataset();
    const row = await prepareOne(dataset, buildDataRow());

    await dataset.commitRow({
      row,
      companyId: 'company-1',
      actorId: 'user-1',
    });

    expect(capture.compensation?.data.baseSalary).toBe(21000);
    expect(capture.compensation?.data.salaryBasis).toBe('MONTHLY');
  });

  it('บอกให้กู้คืนก่อน เมื่อรหัสไปชนกับพนักงานในถังขยะ', async () => {
    const dataset = createDataset({
      employee: [
        {
          id: 'employee-9',
          employeeCode: '670077',
          deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });

    const [row] = await dataset.prepare({
      rows: buildGrid([buildDataRow()]),
      headerRowIndex: 1,
      mapping,
      duplicateMode: 'UPDATE' as never,
      companyId: 'company-1',
    });

    expect(row.action).toBe('ERROR');
    expect(row.errors.join(' ')).toContain('ถังขยะ');
  });
});

/*
 * เทสต์ปลายทางกับไฟล์จริง — กันเคสที่ exceljs อ่านเซลล์ออกมาคนละแบบกับที่จำลองไว้
 * (เช่น เซลล์วันที่จริง หรือรหัสพนักงานที่ถูกเก็บเป็นตัวเลข)
 */
const describeWithSample = existsSync(SAMPLE_FILE) ? describe : describe.skip;

describeWithSample('ทะเบียนพนักงาน — ไฟล์ตัวอย่างจากระบบเดิม', () => {
  it('อ่านไฟล์จริงแล้วจับคู่คอลัมน์ที่จำเป็นได้ครบ', async () => {
    const dataset = createDataset();
    const grid = await readSheetGrid(SAMPLE_FILE);
    const headerRowIndex = detectHeaderRowIndex(grid.rows, dataset.fields);
    const mapping = buildAutoMapping(grid.rows[headerRowIndex], dataset.fields);

    expect(headerRowIndex).toBe(1);
    expect(mapping.employeeCode).toBeTruthy();
    expect(mapping.fullName).toBeTruthy();
    expect(mapping.startDate).toBeTruthy();

    const rows = await dataset.prepare({
      rows: grid.rows,
      headerRowIndex,
      mapping,
      duplicateMode: 'UPDATE' as never,
      companyId: 'company-1',
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.key !== '')).toBe(true);
  });
});
