jest.mock('../payroll/payroll-payslip-pdf.util', () => ({
  __esModule: true,
  launchPayslipBrowser: jest.fn(),
  renderPayslipPdfWithBrowser: jest.fn(),
  generatePayslipPdf: jest.fn(),
  buildPayslipFileName: jest.fn(),
  toPayslipPaperLayout: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';

import { PayrollService } from './payroll.service';
import {
  launchPayslipBrowser,
  renderPayslipPdfWithBrowser,
} from './payroll-payslip-pdf.util';

/**
 * ออกสลิปทั้งรอบเป็นไฟล์ ZIP
 * ========================
 * เส้นทางนี้วนสร้าง PDF ทีละใบด้วย Chromium ตัวเดียว แล้วทยอยเขียนลงซิป
 * สิ่งที่ต้องคุมไว้ด้วยเทส
 *   - เปิด Chromium **ครั้งเดียว** ไม่ใช่ทุกใบ (เป็นเหตุผลทั้งหมดที่แยกเมธอดออกมา)
 *   - ปิด Chromium เสมอ แม้จะพังกลางทาง ไม่งั้นโปรเซสค้างสะสมจนกินแรมหมดเครื่อง
 *   - สลิปใบเดียวพังต้องไม่ทำให้ทั้งรอบล้ม HR ต้องได้ไฟล์ที่เหลือไปใช้ก่อน
 */

type Item = { id: string; employee: { employeeCode: string | null } };

function buildService(
  options: {
    runStatus?: 'APPROVED' | 'PAID' | null;
    items?: Item[];
  } = {},
) {
  const { runStatus = 'APPROVED', items = [] } = options;

  const prisma = {
    payrollRun: {
      findFirst: jest.fn((args: { where: { status?: unknown } }) => {
        /* เรียกจาก assertRunInScope — ไม่มีเงื่อนไข status */
        if (!args.where.status)
          return Promise.resolve({ companyId: 'บริษัท-1' });

        return Promise.resolve(runStatus ? { id: 'รอบ-1' } : null);
      }),
    },
    payrollItem: {
      findMany: jest.fn(() => Promise.resolve(items)),
    },
  };

  const service = new (PayrollService as unknown as new (
    ...args: unknown[]
  ) => PayrollService)(prisma);

  return { prisma, service };
}

const archive = () => {
  const appended: string[] = [];

  return {
    appended,
    append: jest.fn((_buffer: Buffer, opts: { name: string }) => {
      appended.push(opts.name);
    }),
  };
};

const GLOBAL_SCOPE = { level: 'GLOBAL' } as never;

const browser = () => ({ close: jest.fn(() => Promise.resolve()) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PayrollService · ออกสลิปทั้งรอบเป็น ZIP', () => {
  it('รอบที่ยังไม่อนุมัติ ออกสลิปไม่ได้', async () => {
    const { service } = buildService({ runStatus: null });

    await expect(
      service.streamRunPayslipsZip('รอบ-1', GLOBAL_SCOPE, 'FULL', archive()),
    ).rejects.toBeInstanceOf(NotFoundException);

    /* ต้องไม่เปิด Chromium ทิ้งไว้ก่อนจะรู้ว่าออกไม่ได้ */
    expect(launchPayslipBrowser).not.toHaveBeenCalled();
  });

  it('รอบที่ไม่มีพนักงานสักคน บอกให้รู้ ไม่ส่งซิปเปล่า', async () => {
    const { service } = buildService({ items: [] });

    await expect(
      service.streamRunPayslipsZip('รอบ-1', GLOBAL_SCOPE, 'FULL', archive()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(launchPayslipBrowser).not.toHaveBeenCalled();
  });

  it('สร้างครบทุกใบ และเปิด Chromium ครั้งเดียว', async () => {
    const items: Item[] = [
      { id: 'ก', employee: { employeeCode: '670001' } },
      { id: 'ข', employee: { employeeCode: '670002' } },
      { id: 'ค', employee: { employeeCode: '670003' } },
    ];
    const { service } = buildService({ items });
    const zip = archive();
    const chrome = browser();

    (launchPayslipBrowser as jest.Mock).mockResolvedValue(chrome);
    (renderPayslipPdfWithBrowser as jest.Mock).mockImplementation(
      (_browser: unknown, item: Item) =>
        Promise.resolve({
          buffer: Buffer.from('pdf'),
          fileName: `slip-${item.employee.employeeCode}.pdf`,
        }),
    );

    const result = await service.streamRunPayslipsZip(
      'รอบ-1',
      GLOBAL_SCOPE,
      'FULL',
      zip,
    );

    expect(result).toEqual({ total: 3, failed: [] });
    expect(zip.appended).toEqual([
      'slip-670001.pdf',
      'slip-670002.pdf',
      'slip-670003.pdf',
    ]);

    /* หัวใจของการ refactor — เปิดครั้งเดียวสำหรับทั้งรอบ */
    expect(launchPayslipBrowser).toHaveBeenCalledTimes(1);
    expect(renderPayslipPdfWithBrowser).toHaveBeenCalledTimes(3);
    expect(chrome.close).toHaveBeenCalledTimes(1);
  });

  it('เรียงตามรหัสพนักงาน ไม่ใช่ลำดับที่ฐานข้อมูลคืนมา', async () => {
    const { service, prisma } = buildService({
      items: [{ id: 'ก', employee: { employeeCode: '670001' } }],
    });

    (launchPayslipBrowser as jest.Mock).mockResolvedValue(browser());
    (renderPayslipPdfWithBrowser as jest.Mock).mockResolvedValue({
      buffer: Buffer.from('pdf'),
      fileName: 'slip.pdf',
    });

    await service.streamRunPayslipsZip(
      'รอบ-1',
      GLOBAL_SCOPE,
      'FULL',
      archive(),
    );

    expect(prisma.payrollItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { employee: { employeeCode: 'asc' } },
      }),
    );
  });

  it('ใบเดียวพัง ใบที่เหลือยังได้ครบ และรายงานว่าใครพลาด', async () => {
    const items: Item[] = [
      { id: 'ก', employee: { employeeCode: '670001' } },
      { id: 'ข', employee: { employeeCode: '670002' } },
      { id: 'ค', employee: { employeeCode: '670003' } },
    ];
    const { service } = buildService({ items });
    const zip = archive();
    const chrome = browser();

    (launchPayslipBrowser as jest.Mock).mockResolvedValue(chrome);
    (renderPayslipPdfWithBrowser as jest.Mock).mockImplementation(
      (_browser: unknown, item: Item) =>
        item.employee.employeeCode === '670002'
          ? Promise.reject(new Error('เรนเดอร์ไม่สำเร็จ'))
          : Promise.resolve({
              buffer: Buffer.from('pdf'),
              fileName: `slip-${item.employee.employeeCode}.pdf`,
            }),
    );

    const result = await service.streamRunPayslipsZip(
      'รอบ-1',
      GLOBAL_SCOPE,
      'FULL',
      zip,
    );

    expect(zip.appended).toEqual(['slip-670001.pdf', 'slip-670003.pdf']);
    expect(result.total).toBe(3);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toContain('670002');
    expect(result.failed[0]).toContain('เรนเดอร์ไม่สำเร็จ');
    expect(chrome.close).toHaveBeenCalledTimes(1);
  });

  it('พนักงานที่ไม่มีรหัส ยังรายงานได้ด้วย id ไม่ใช่ค่าว่าง', async () => {
    const { service } = buildService({
      items: [{ id: 'รายการ-9', employee: { employeeCode: null } }],
    });

    (launchPayslipBrowser as jest.Mock).mockResolvedValue(browser());
    (renderPayslipPdfWithBrowser as jest.Mock).mockRejectedValue(
      new Error('พัง'),
    );

    const result = await service.streamRunPayslipsZip(
      'รอบ-1',
      GLOBAL_SCOPE,
      'FULL',
      archive(),
    );

    expect(result.failed[0]).toContain('รายการ-9');
  });

  it('ปิด Chromium แม้เกิดข้อผิดพลาดที่กู้ไม่ได้กลางทาง', async () => {
    /*
     * ข้อนี้สำคัญกว่าที่เห็น — Chromium ที่ไม่ถูกปิดจะค้างเป็นโปรเซสผี
     * กินแรมหลักร้อย MB ต่อตัว ออกสลิปพลาดไม่กี่รอบก็เครื่องเต็ม
     */
    const { service } = buildService({
      items: [{ id: 'ก', employee: { employeeCode: '670001' } }],
    });
    const chrome = browser();
    const zip = archive();

    (launchPayslipBrowser as jest.Mock).mockResolvedValue(chrome);
    (renderPayslipPdfWithBrowser as jest.Mock).mockResolvedValue({
      buffer: Buffer.from('pdf'),
      fileName: 'slip.pdf',
    });
    zip.append.mockImplementation(() => {
      throw new Error('เขียนลงซิปไม่ได้');
    });

    await expect(
      service.streamRunPayslipsZip('รอบ-1', GLOBAL_SCOPE, 'FULL', zip),
    ).resolves.toBeDefined();

    expect(chrome.close).toHaveBeenCalledTimes(1);
  });
});
